import { injectScriptSetup } from './scriptSetup.js';
import type { LocaleDictionary } from './types.js';

export type InlineLocalePayload = {
	global: LocaleDictionary;
	module: LocaleDictionary;
};

export type InlineChunkManifest = {
	primaryLocale: string;
	entries: Array<{
		fileName: string;
		originalFileName: string;
		locales: Record<string, string>;
	}>;
};

export type InlineLocaleLoaderAsset = {
	fileName: string;
	source: string;
};

type ModuleMessages = Partial<Record<string, Partial<Record<string, LocaleDictionary>>>>;
type LocaleMessages = Partial<Record<string, LocaleDictionary>>;
type PublicLocaleScope = 'env' | 'sfc';
type InlinePayloadResolver = (moduleId: string) => InlineLocalePayload;
type MutableOutputChunk = {
	type: 'chunk';
	fileName: string;
	code: string;
	imports: string[];
	dynamicImports: string[];
	[key: string]: unknown;
};
type MutableOutputBundle = Record<string, unknown>;
type MutableOutputAsset = {
	type: 'asset';
	fileName: string;
	source: string | Uint8Array;
	names?: string[];
	originalFileNames?: string[];
	[key: string]: unknown;
};

const INLINE_MARKER_PREFIX = '__VUE_INTERNATIONALIZATION_INLINE__:';
const INLINE_CALL_RE = /__VUE_INTERNATIONALIZATION_INLINE_LOCALE__\("(__VUE_INTERNATIONALIZATION_INLINE__:[A-Za-z0-9+/=]+)"\)/g;
const INLINE_LOCALIZERS_CALL_RE = /__VUE_INTERNATIONALIZATION_INLINE_LOCALIZERS__\("(__VUE_INTERNATIONALIZATION_INLINE__:[A-Za-z0-9+/=]+)"\)/g;
const INLINE_BINDING_RE =
	/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*__VUE_INTERNATIONALIZATION_INLINE_LOCALE__\("(__VUE_INTERNATIONALIZATION_INLINE__:[A-Za-z0-9+/=]+)"\)/g;
const INLINE_TEXT_RE =
	/(?:\b[A-Za-z_$][\w$]*\.)?__VUE_INTERNATIONALIZATION_INLINE_TEXT__\("(__VUE_INTERNATIONALIZATION_INLINE__:[A-Za-z0-9+/=]+)","((?:env|sfc)(?:\.[A-Za-z_$][\w$]*)+)"\)/g;
const INLINE_LOCALIZER_RE =
	/(?:\b[A-Za-z_$][\w$]*\.)?__VUE_INTERNATIONALIZATION_INLINE_LOCALIZER__\("(__VUE_INTERNATIONALIZATION_INLINE__:[A-Za-z0-9+/=]+)","((?:env|sfc)(?:\.[A-Za-z_$][\w$]*)+)",(\{[^)]*\})\)/g;
const LOCALE_ACCESS_RE = /\$locale(?:\.value)?\.(env|sfc)((?:\.[A-Za-z_$][\w$]*)+)/g;
const LOCALIZER_ACCESS_RE = /\$l(?:\.value)?\.(env|sfc)((?:\.[A-Za-z_$][\w$]*)+)\((\{[^)]*\})\)/g;

export function createInlineLocaleMarker(moduleId: string): string {
	return `${INLINE_MARKER_PREFIX}${Buffer.from(moduleId, 'utf8').toString('base64')}`;
}

export function injectInlineLocaleBinding(code: string, moduleId: string): string {
	const injection = [
		'',
		`const $locale = __VUE_INTERNATIONALIZATION_INLINE_LOCALE__(${JSON.stringify(createInlineLocaleMarker(moduleId))});`,
		`const $l = __VUE_INTERNATIONALIZATION_INLINE_LOCALIZERS__(${JSON.stringify(createInlineLocaleMarker(moduleId))});`,
		'',
	].join('\n');

	return injectScriptSetup(code, injection);
}

export function rewriteInlineLocaleTemplateAccess(code: string, moduleId: string): string {
	const marker = createInlineLocaleMarker(moduleId);

	return code.replace(/<template\b[^>]*>[\s\S]*?<\/template>/g, (template) =>
		template
			.replace(LOCALIZER_ACCESS_RE, (_match, scope: PublicLocaleScope, pathExpression: string, valuesExpression: string) =>
				`__VUE_INTERNATIONALIZATION_INLINE_LOCALIZER__(${JSON.stringify(marker)},${JSON.stringify(`${scope}${pathExpression}`)},${valuesExpression})`,
			)
			.replace(LOCALE_ACCESS_RE, (_match, scope: PublicLocaleScope, pathExpression: string) =>
				`__VUE_INTERNATIONALIZATION_INLINE_TEXT__(${JSON.stringify(marker)},${JSON.stringify(`${scope}${pathExpression}`)})`,
			),
	);
}

export function inlineLocaleChunks(
	bundle: MutableOutputBundle,
	locales: string[],
	primaryLocale: string,
	modules: ModuleMessages,
	globalMessages: LocaleMessages,
): InlineChunkManifest {
	const manifest: InlineChunkManifest = {
		primaryLocale,
		entries: [],
	};
	const localizableChunks = Object.values(bundle)
		.filter((chunk): chunk is MutableOutputChunk => isMutableOutputChunk(chunk) && chunk.code.includes(INLINE_MARKER_PREFIX))
		.map((chunk) => ({
			chunk,
			originalCode: chunk.code,
			originalFileName: chunk.fileName,
			originalImports: [...chunk.imports],
			originalDynamicImports: [...chunk.dynamicImports],
		}));
	const localizableFiles = new Set(localizableChunks.map(({ originalFileName }) => originalFileName));

	for (const { chunk, originalCode, originalFileName, originalImports, originalDynamicImports } of localizableChunks) {
		const primaryFileName = addLocaleToFileName(originalFileName, primaryLocale);
		const localeFiles: Record<string, string> = {
			[primaryLocale]: primaryFileName,
		};

		for (const locale of locales) {
			const localizedChunk: MutableOutputChunk = locale === primaryLocale ? chunk : {
				...chunk,
				fileName: addLocaleToFileName(originalFileName, locale),
			};

			localizedChunk.fileName = addLocaleToFileName(originalFileName, locale);
			localizedChunk.imports = originalImports.map((fileName) => addLocaleToImportedFileName(localizableFiles, fileName, locale));
			localizedChunk.dynamicImports = originalDynamicImports.map((fileName) =>
				addLocaleToImportedFileName(localizableFiles, fileName, locale),
			);
			localizedChunk.code = replaceChunkFileReferences(
				replaceInlineLocaleMarkers(originalCode, locale, primaryLocale, modules, globalMessages),
				getLocalizableChunkReferences(originalImports, originalDynamicImports, localizableFiles),
				locale,
			);

			bundle[localizedChunk.fileName] = localizedChunk;
			localeFiles[locale] = localizedChunk.fileName;
		}

		delete bundle[originalFileName];
		manifest.entries.push({
			fileName: primaryFileName,
			originalFileName,
			locales: localeFiles,
		});
	}

	return manifest;
}

export function replaceInlineLocaleMarkers(
	code: string,
	locale: string,
	primaryLocale: string,
	modules: ModuleMessages,
	globalMessages: LocaleMessages,
): string {
	const resolvePayload = createInlinePayloadResolver(locale, primaryLocale, modules, globalMessages);

	return replaceInlineLocaleObjectsWithResolver(
		replaceInlineLocaleTextAccessWithResolver(
			replaceInlineLocalizerAccessWithResolver(
				replaceInlineLocaleMemberAccessWithResolver(code, resolvePayload),
				resolvePayload,
			),
			resolvePayload,
		),
		resolvePayload,
	);
}

export function replaceInlineLocalizerAccess(
	code: string,
	locale: string,
	primaryLocale: string,
	modules: ModuleMessages,
	globalMessages: LocaleMessages,
): string {
	return replaceInlineLocalizerAccessWithResolver(
		code,
		createInlinePayloadResolver(locale, primaryLocale, modules, globalMessages),
	);
}

function replaceInlineLocalizerAccessWithResolver(code: string, resolvePayload: InlinePayloadResolver): string {
	let next = code.replaceAll(INLINE_LOCALIZER_RE, (_match, marker: string, path: string, valuesExpression: string) => {
		const moduleId = decodeInlineLocaleMarker(marker);
		const [scope, ...keys] = path.split('.') as [PublicLocaleScope, ...string[]];
		const payload = resolvePayload(moduleId);
		const value = getValueByPath(getPayloadScope(payload, scope), keys);
		const template = typeof value === 'string' ? value : `$locale.${path}`;

		return createInlineTemplateExpression(template, valuesExpression);
	});

	for (const match of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*__VUE_INTERNATIONALIZATION_INLINE_LOCALIZERS__\("(__VUE_INTERNATIONALIZATION_INLINE__:[A-Za-z0-9+/=]+)"\)/g)) {
		const [, variableName, marker] = match;

		if (!variableName || !marker) {
			continue;
		}

		const moduleId = decodeInlineLocaleMarker(marker);
		const payload = resolvePayload(moduleId);

		next = replaceLocalizerCallAccess(next, variableName, payload);
	}

	return next;
}

export function replaceInlineLocaleTextAccess(
	code: string,
	locale: string,
	primaryLocale: string,
	modules: ModuleMessages,
	globalMessages: LocaleMessages,
): string {
	return replaceInlineLocaleTextAccessWithResolver(
		code,
		createInlinePayloadResolver(locale, primaryLocale, modules, globalMessages),
	);
}

function replaceInlineLocaleTextAccessWithResolver(code: string, resolvePayload: InlinePayloadResolver): string {
	return code.replaceAll(INLINE_TEXT_RE, (_match, marker: string, path: string) => {
		const moduleId = decodeInlineLocaleMarker(marker);
		const [scope, ...keys] = path.split('.') as [PublicLocaleScope, ...string[]];
		const payload = resolvePayload(moduleId);
		const value = getValueByPath(getPayloadScope(payload, scope), keys);

		return JSON.stringify(value ?? `$locale.${path}`);
	});
}

export function replaceInlineLocaleMemberAccess(
	code: string,
	locale: string,
	primaryLocale: string,
	modules: ModuleMessages,
	globalMessages: LocaleMessages,
): string {
	return replaceInlineLocaleMemberAccessWithResolver(
		code,
		createInlinePayloadResolver(locale, primaryLocale, modules, globalMessages),
	);
}

function replaceInlineLocaleMemberAccessWithResolver(code: string, resolvePayload: InlinePayloadResolver): string {
	let next = code;

	for (const match of code.matchAll(INLINE_BINDING_RE)) {
		const [, variableName, marker] = match;

		if (!variableName || !marker) {
			continue;
		}

		const moduleId = decodeInlineLocaleMarker(marker);
		const payload = resolvePayload(moduleId);

		next = replacePayloadMemberAccess(next, variableName, payload);
	}

	return next;
}

function replaceInlineLocaleObjectsWithResolver(code: string, resolvePayload: InlinePayloadResolver): string {
	return code.replaceAll(INLINE_LOCALIZERS_CALL_RE, (_match, marker: string) => {
		const moduleId = decodeInlineLocaleMarker(marker);
		const payload = resolvePayload(moduleId);

		return createInlineRefAliasExpression(`{env:${createLocalizerObjectExpression(payload.global)},sfc:${createLocalizerObjectExpression(payload.module)}}`);
	}).replaceAll(INLINE_CALL_RE, (_match, marker: string) => {
		const moduleId = decodeInlineLocaleMarker(marker);
		const payload = resolvePayload(moduleId);
		const fallbackPayload = {
			env: createFallbackObject(payload.global, 'env'),
			sfc: createFallbackObject(payload.module, 'sfc'),
		};

		return createInlineRefAliasExpression(JSON.stringify(fallbackPayload));
	});
}

export function inlineLocaleHtml(bundle: MutableOutputBundle, manifest: InlineChunkManifest): void {
	for (const asset of Object.values(bundle)) {
		if (!isMutableOutputAsset(asset) || typeof asset.source !== 'string' || !asset.fileName.endsWith('.html')) {
			continue;
		}

		for (const loader of getInlineLocaleHtmlLoaders(asset.source, manifest)) {
			bundle[loader.fileName] = {
				type: 'asset',
				fileName: loader.fileName,
				names: [],
				originalFileNames: [],
				source: loader.source,
			};
		}

		asset.source = replaceInlineLocaleHtml(asset.source, manifest);
	}
}

export function getInlineLocaleHtmlLoaders(html: string, manifest: InlineChunkManifest): InlineLocaleLoaderAsset[] {
	return findHtmlLocaleEntries(html, manifest).map((entry) => ({
		fileName: createLocaleLoaderFileName(entry.originalFileName),
		source: createLocaleLoaderSource(entry.locales, manifest.primaryLocale),
	}));
}

export function replaceInlineLocaleHtml(html: string, manifest: InlineChunkManifest): string {
	let next = html;

	for (const entry of manifest.entries) {
		next = replaceEntryScript(next, entry.locales, manifest.primaryLocale);
	}

	return next;
}

export function augmentViteManifestJson(source: string, inlineManifest: InlineChunkManifest): string {
	const manifest = JSON.parse(source) as Record<string, Record<string, unknown>>;

	for (const entry of inlineManifest.entries) {
		const manifestEntry = findManifestEntry(manifest, Object.values(entry.locales));

		if (!manifestEntry) {
			continue;
		}

		const [key, value] = manifestEntry;
		value.file = entry.locales[inlineManifest.primaryLocale];
		value.locale = inlineManifest.primaryLocale;
		value.internationalization = {
			primaryLocale: inlineManifest.primaryLocale,
			locales: entry.locales,
		};

		for (const [locale, fileName] of Object.entries(entry.locales)) {
			manifest[`${key}?locale=${locale}`] = {
				...value,
				file: fileName,
				locale,
				isInternationalizationLocale: true,
			};
		}
	}

	return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function addLocaleToFileName(fileName: string, locale: string): string {
	return fileName.replace(/(\.m?js)$/u, `.${sanitizeLocale(locale)}$1`);
}

function addLocaleToImportedFileName(localizableFiles: Set<string>, fileName: string, locale: string): string {
	if (localizableFiles.has(fileName)) {
		return addLocaleToFileName(fileName, locale);
	}

	return fileName;
}

function getLocalizableChunkReferences(
	imports: string[],
	dynamicImports: string[],
	localizableFiles: Set<string>,
): Set<string> {
	return new Set(
		[...imports, ...dynamicImports]
			.filter((fileName) => localizableFiles.has(fileName)),
	);
}

function replaceChunkFileReferences(code: string, localizableFiles: Set<string>, locale: string): string {
	let next = code;

	for (const fileName of localizableFiles) {
		const localizedFileName = addLocaleToFileName(fileName, locale);

		next = next.replaceAll(fileName, localizedFileName);
		next = next.replaceAll(baseName(fileName), baseName(localizedFileName));
	}

	return next;
}

function createInlinePayloadResolver(
	locale: string,
	primaryLocale: string,
	modules: ModuleMessages,
	globalMessages: LocaleMessages,
): InlinePayloadResolver {
	const global = mergeWithPrimary(globalMessages[locale], globalMessages[primaryLocale]);
	const modulesById = new Map<string, LocaleDictionary>();

	return (moduleId) => {
		let module = modulesById.get(moduleId);

		if (!module) {
			module = mergeWithPrimary(modules[moduleId]?.[locale], modules[moduleId]?.[primaryLocale]);
			modulesById.set(moduleId, module);
		}

		return {
			global,
			module,
		};
	};
}

function replacePayloadMemberAccess(code: string, variableName: string, payload: InlineLocalePayload): string {
	const memberRe = new RegExp(`\\b${escapeRegExp(variableName)}(?:\\.value)?\\.(env|sfc)((?:\\.[A-Za-z_$][\\w$]*)+)`, 'gu');

	return code.replace(memberRe, (match, scope: PublicLocaleScope, pathExpression: string) => {
		const path = pathExpression.slice(1).split('.');
		const value = getValueByPath(getPayloadScope(payload, scope), path);

		return JSON.stringify(value ?? `$locale.${[scope, ...path].join('.')}`);
	});
}

function replaceLocalizerCallAccess(code: string, variableName: string, payload: InlineLocalePayload): string {
	const memberRe = new RegExp(`\\b${escapeRegExp(variableName)}(?:\\.value)?\\.(env|sfc)((?:\\.[A-Za-z_$][\\w$]*)+)\\((\\{[^)]*\\})\\)`, 'gu');

	return code.replace(memberRe, (match, scope: PublicLocaleScope, pathExpression: string, valuesExpression: string) => {
		const path = pathExpression.slice(1).split('.');
		const value = getValueByPath(getPayloadScope(payload, scope), path);
		const template = typeof value === 'string' ? value : `$locale.${[scope, ...path].join('.')}`;

		return createInlineTemplateExpression(template, valuesExpression);
	});
}

function createInlineTemplateExpression(template: string, valuesExpression: string): string {
	const parts: string[] = [];
	let cursor = 0;
	let hasToken = false;

	for (const match of template.matchAll(/\{([A-Za-z_$][\w$]*)\}/g)) {
		const index = match.index;
		const key = match[1];

		if (!key) {
			continue;
		}

		if (index > cursor) {
			parts.push(JSON.stringify(template.slice(cursor, index)));
		}

		parts.push(`(__values.${key} == null ? ${JSON.stringify(`{${key}}`)} : __values.${key})`);
		hasToken = true;
		cursor = index + match[0].length;
	}

	if (cursor < template.length) {
		parts.push(JSON.stringify(template.slice(cursor)));
	}

	if (!hasToken) {
		return JSON.stringify(template);
	}

	return `((__values) => ${parts.join(' + ')})(${valuesExpression})`;
}

function createLocalizerObjectExpression(dictionary: LocaleDictionary): string {
	const entries = Object.entries(dictionary).map(([key, value]) => {
		const property = /^[$A-Z_a-z][$\w]*$/.test(key) ? key : JSON.stringify(key);
		const expression = isDictionary(value)
			? createLocalizerObjectExpression(value)
			: `(values = {}) => ${createInlineTemplateExpression(typeof value === 'string' ? value : String(value), 'values')}`;

		return `${property}:${expression}`;
	});

	return `{${entries.join(',')}}`;
}

function createInlineRefAliasExpression(expression: string): string {
	return `(() => { const __locale = ${expression}; __locale.value = __locale; return __locale; })()`;
}

function getPayloadScope(payload: InlineLocalePayload, scope: PublicLocaleScope): LocaleDictionary {
	return scope === 'env' ? payload.global : payload.module;
}

function mergeWithPrimary(current: LocaleDictionary | undefined, primary: LocaleDictionary | undefined): LocaleDictionary {
	return deepMerge(primary ?? {}, current ?? {});
}

function deepMerge(fallback: LocaleDictionary, current: LocaleDictionary): LocaleDictionary {
	const merged: LocaleDictionary = { ...fallback };

	for (const [key, value] of Object.entries(current)) {
		const fallbackValue = fallback[key];
		merged[key] = isDictionary(value) && isDictionary(fallbackValue) ? deepMerge(fallbackValue, value) : value;
	}

	return merged;
}

function createFallbackObject(dictionary: LocaleDictionary, path: string): LocaleDictionary {
	const result: LocaleDictionary = {};

	for (const [key, value] of Object.entries(dictionary)) {
		result[key] = isDictionary(value) ? createFallbackObject(value, `${path}.${key}`) : value;
	}

	return new Proxy(result, {
		get(target, property) {
			if (typeof property !== 'string') {
				return Reflect.get(target, property);
			}

			if (Object.prototype.hasOwnProperty.call(target, property)) {
				return target[property];
			}

			return `$locale.${path}.${property}`;
		},
	});
}

function getValueByPath(value: LocaleDictionary, path: string[]): unknown {
	let current: unknown = value;

	for (const key of path) {
		if (current == null || typeof current !== 'object' || Array.isArray(current) || !(key in current)) {
			return undefined;
		}

		current = (current as Record<string, unknown>)[key];
	}

	return current;
}

function isDictionary(value: unknown): value is LocaleDictionary {
	return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isMutableOutputChunk(value: unknown): value is MutableOutputChunk {
	if (value == null || typeof value !== 'object') {
		return false;
	}

	const maybeChunk = value as Partial<MutableOutputChunk>;

	return (
		maybeChunk.type === 'chunk' &&
    typeof maybeChunk.fileName === 'string' &&
    typeof maybeChunk.code === 'string' &&
    Array.isArray(maybeChunk.imports) &&
    Array.isArray(maybeChunk.dynamicImports)
	);
}

function isMutableOutputAsset(value: unknown): value is MutableOutputAsset {
	if (value == null || typeof value !== 'object') {
		return false;
	}

	const maybeAsset = value as { type?: unknown; fileName?: unknown };

	return maybeAsset.type === 'asset' && typeof maybeAsset.fileName === 'string';
}

function replaceEntryScript(html: string, localeFiles: Record<string, string>, primaryLocale: string): string {
	return html.replace(createEntryScriptRegExp(localeFiles, primaryLocale), (_match, beforeSrc: string, afterSrc: string) => {
		const primaryFile = localeFiles[primaryLocale];
		const loaderFileName = createLocaleLoaderFileName(originalFileNameFromLocaleFile(primaryFile, primaryLocale));

		return `<script${createLoaderScriptAttributes(beforeSrc, afterSrc, loaderFileName)}></script>`;
	});
}

function findHtmlLocaleEntries(html: string, manifest: InlineChunkManifest): InlineChunkManifest['entries'] {
	return manifest.entries.filter((entry) => createEntryScriptRegExp(entry.locales, manifest.primaryLocale).test(html));
}

function createEntryScriptRegExp(localeFiles: Record<string, string>, primaryLocale: string): RegExp {
	const primaryFile = localeFiles[primaryLocale];
	const candidates = new Set([
		originalFileNameFromLocaleFile(primaryFile, primaryLocale),
		...Object.values(localeFiles),
	]);

	return new RegExp(
		`<script\\b([^>]*?)\\bsrc=["']/(?:${[...candidates].map(escapeRegExp).join('|')})["']([^>]*)></script>`,
		'u',
	);
}

function createLocaleLoaderFileName(originalFileName: string): string {
	return originalFileName.replace(/(\.m?js)$/u, '.i18n-loader$1');
}

function createLocaleLoaderSource(localeFiles: Record<string, string>, primaryLocale: string): string {
	return [
		`const __vueInternationalizationLocale = new URL(window.location.href).searchParams.get("locale") || ${JSON.stringify(primaryLocale)};`,
		`const __vueInternationalizationEntries = ${JSON.stringify(toAbsoluteLocaleFiles(localeFiles))};`,
		`import(__vueInternationalizationEntries[__vueInternationalizationLocale] || __vueInternationalizationEntries[${JSON.stringify(primaryLocale)}]);`,
		'',
	].join('\n');
}

function createLoaderScriptAttributes(beforeSrc: string, afterSrc: string, loaderFileName: string): string {
	const attributes = removeScriptAttribute(`${beforeSrc}${afterSrc}`, 'src');
	const withoutIntegrity = removeScriptAttribute(attributes, 'integrity');
	const typeAttribute = hasScriptAttribute(withoutIntegrity, 'type') ? '' : ' type="module"';

	return `${withoutIntegrity}${typeAttribute} src="/${loaderFileName}"`;
}

function removeScriptAttribute(attributes: string, name: string): string {
	return attributes.replace(new RegExp(`\\s+${escapeRegExp(name)}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'giu'), '');
}

function hasScriptAttribute(attributes: string, name: string): boolean {
	return new RegExp(`(?:^|\\s)${escapeRegExp(name)}(?:\\s*=|\\s|$)`, 'iu').test(attributes);
}

function toAbsoluteLocaleFiles(localeFiles: Record<string, string>): Record<string, string> {
	return Object.fromEntries(Object.entries(localeFiles).map(([locale, fileName]) => [locale, `/${fileName}`]));
}

function findManifestEntry(
	manifest: Record<string, Record<string, unknown>>,
	fileNames: string[],
): [string, Record<string, unknown>] | undefined {
	return Object.entries(manifest).find(([, value]) => typeof value.file === 'string' && fileNames.includes(value.file));
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function decodeInlineLocaleMarker(marker: string): string {
	if (!marker.startsWith(INLINE_MARKER_PREFIX)) {
		throw new Error(`Invalid inline locale marker: ${marker}`);
	}

	return Buffer.from(marker.slice(INLINE_MARKER_PREFIX.length), 'base64').toString('utf8');
}

function sanitizeLocale(locale: string): string {
	return locale.replace(/[^A-Za-z0-9_-]/gu, '-');
}

function baseName(fileName: string): string {
	return fileName.split('/').at(-1) ?? fileName;
}

function originalFileNameFromLocaleFile(fileName: string, locale: string): string {
	return fileName.replace(new RegExp(`\\.${escapeRegExp(sanitizeLocale(locale))}(\\.m?js)$`, 'u'), '$1');
}
