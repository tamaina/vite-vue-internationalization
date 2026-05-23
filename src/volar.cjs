const { dirname, isAbsolute, resolve } = require('node:path');
const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const YAML = require('yaml');

const plugin = ({ config }) => {
	return {
		version: 2.2,
		name: 'vue-internationalization',
		order: 1,
		resolveEmbeddedCode(fileName, ir, embeddedFile) {
			if (!/^script_(js|jsx|ts|tsx)$/.test(embeddedFile.id) || !hasLocaleBlocks(ir.customBlocks)) {
				return;
			}

			const primaryLocale = config.primaryLocale ?? getFirstLocale(ir.customBlocks);
			const moduleDictionary = getLocaleDictionary(ir.customBlocks, primaryLocale);
			const globalDictionary = getGlobalDictionary(config, primaryLocale, fileName);
			const localeRefType = createLocaleRefType({
				global: globalDictionary,
				module: moduleDictionary,
			});
			const localeScopeType = createLocaleScopeType({
				global: globalDictionary,
				module: moduleDictionary,
			});
			const localizerRefType = createLocalizerRefType({
				global: globalDictionary,
				module: moduleDictionary,
			});
			const localizerScopeType = createLocalizerScopeType({
				global: globalDictionary,
				module: moduleDictionary,
			});
			const declaration = `declare const $locale: ${localeRefType};\ndeclare const $l: ${localizerRefType};\n`;
			const setupExposure = '$locale: typeof $locale;\n$l: typeof $l;\n';

			embeddedFile.content.unshift(declaration);
			insertAfter(
				embeddedFile.content,
				"type __VLS_SetupExposed = import('vue').ShallowUnwrapRef<{\n",
				setupExposure,
			);
			insertAfter(
				embeddedFile.content,
				'...{} as import(\'vue\').ComponentPublicInstance,\n',
				`...{} as { $locale: ${localeScopeType}; $l: ${localizerScopeType}; },\n`,
			);
			replaceFirst(
				embeddedFile.content,
				"const __VLS_ctx = {} as import('vue').ComponentPublicInstance;",
				`const __VLS_ctx = {} as import('vue').ComponentPublicInstance & { $locale: ${localeScopeType}; $l: ${localizerScopeType}; };`,
			);
		},
	};
};

module.exports = plugin;
module.exports.default = plugin;

function hasLocaleBlocks(customBlocks) {
	return customBlocks.some((block) => block.type === 'locale');
}

function insertAfter(content, marker, insertion) {
	replaceFirst(content, marker, `${marker}${insertion}`);
}

function replaceFirst(content, search, replacement) {
	const text = content.map((segment) => getSegmentText(segment) ?? '').join('');
	const start = text.indexOf(search);

	if (start < 0) {
		return;
	}

	replaceGeneratedRange(content, start, start + search.length, replacement);
}

function replaceGeneratedRange(content, start, end, replacement) {
	const next = [];
	let offset = 0;
	let inserted = false;

	for (let index = 0; index < content.length; index++) {
		const segment = content[index];
		const text = getSegmentText(segment);

		if (text === undefined) {
			next.push(segment);
			continue;
		}

		const segmentStart = offset;
		const segmentEnd = offset + text.length;

		if (segmentEnd <= start || segmentStart >= end) {
			next.push(segment);
		} else {
			const prefixEnd = Math.max(0, start - segmentStart);
			const suffixStart = Math.min(text.length, end - segmentStart);

			if (prefixEnd > 0) {
				next.push(sliceSegment(segment, 0, prefixEnd));
			}

			if (!inserted) {
				next.push(replacement);
				inserted = true;
			}

			if (suffixStart < text.length) {
				next.push(sliceSegment(segment, suffixStart, text.length));
			}
		}

		offset = segmentEnd;
	}

	content.splice(0, content.length, ...next);
}

function getSegmentText(segment) {
	if (typeof segment === 'string') {
		return segment;
	}

	return typeof segment[0] === 'string' ? segment[0] : undefined;
}

function sliceSegment(segment, start, end) {
	if (typeof segment === 'string') {
		return segment.slice(start, end);
	}

	const next = [...segment];
	next[0] = segment[0].slice(start, end);

	if (typeof next[2] === 'number') {
		next[2] += start;
	}

	return next;
}

function getFirstLocale(customBlocks) {
	for (const block of customBlocks) {
		if (block.type === 'locale' && typeof block.attrs.locale === 'string') {
			return block.attrs.locale;
		}
	}
}

function getLocaleDictionary(customBlocks, primaryLocale) {
	const localeBlocks = customBlocks.filter((block) => block.type === 'locale' && typeof block.attrs.locale === 'string');

	if (localeBlocks.length === 0) {
		return {};
	}

	const block = localeBlocks.find((item) => item.attrs.locale === primaryLocale) ?? localeBlocks[0];
	return parseLocaleDictionary(block.content, block.lang ?? 'yaml', `<locale locale="${String(block.attrs.locale)}">`);
}

function getGlobalDictionary(config, primaryLocale, fileName) {
	const global = config.global;

	if (!global || !primaryLocale) {
		return undefined;
	}

	const value = global[primaryLocale];

	if (!value) {
		return undefined;
	}

	if (typeof value !== 'string' && !Array.isArray(value)) {
		return value;
	}

	return loadLocaleEnvDictionary(findConfigDir(fileName), primaryLocale, value);
}

function loadLocaleEnvDictionary(root, locale, source) {
	const files = expandLocaleEnvSources(root, source);
	const merged = {};

	for (const file of files) {
		const lang = file.endsWith('.json') ? 'json' : 'yaml';
		const dictionary = parseLocaleDictionary(readFileSync(file, 'utf8'), lang, file);
		mergeLocaleEnvDictionary(merged, dictionary, [], `${locale}:${file}`);
	}

	return merged;
}

function mergeLocaleEnvDictionary(target, source, path, sourceLabel) {
	for (const [key, value] of Object.entries(source)) {
		const currentPath = [...path, key];
		const current = target[key];

		if (isPlainDictionary(current) && isPlainDictionary(value)) {
			mergeLocaleEnvDictionary(current, value, currentPath, sourceLabel);
			continue;
		}

		if (Object.prototype.hasOwnProperty.call(target, key)) {
			console.warn(`[vue-internationalization] Duplicate env key "${currentPath.join('.')}" in ${sourceLabel}; overwriting previous value.`);
		}

		target[key] = value;
	}
}

function expandLocaleEnvSources(root, source) {
	const sources = Array.isArray(source) ? source : [source];
	const files = new Set();

	for (const entry of sources) {
		for (const file of expandLocaleEnvSource(root, entry)) {
			files.add(file);
		}
	}

	return [...files].sort();
}

function expandLocaleEnvSource(root, source) {
	const pattern = normalizePath(isAbsolute(source) ? source : resolve(root, source));

	if (!hasGlob(pattern)) {
		return [pattern];
	}

	const base = getGlobBase(pattern);
	const files = findFiles(base)
		.map((file) => normalizePath(file))
		.filter((file) => matchGlob(pattern, file));

	return files.sort();
}

function findConfigDir(fileName) {
	let dir = dirname(fileName);

	while (dir !== dirname(dir)) {
		if (existsSync(resolve(dir, 'tsconfig.json'))) {
			return dir;
		}

		dir = dirname(dir);
	}

	return process.cwd();
}

function isPlainDictionary(value) {
	return value != null && typeof value === 'object' && !Array.isArray(value);
}

function hasGlob(value) {
	return /[*?]/u.test(value);
}

function normalizePath(value) {
	return value.replace(/\\/g, '/');
}

function getGlobBase(pattern) {
	const segments = pattern.split('/');
	const globIndex = segments.findIndex((segment) => hasGlob(segment));
	const baseSegments = globIndex < 0 ? segments : segments.slice(0, globIndex);
	const base = baseSegments.join('/');

	return base.length === 0 ? '/' : base;
}

function findFiles(dir) {
	if (!existsSync(dir)) {
		return [];
	}

	const stat = statSync(dir);

	if (stat.isFile()) {
		return [dir];
	}

	if (!stat.isDirectory()) {
		return [];
	}

	const files = [];

	for (const entry of readdirSync(dir)) {
		const file = resolve(dir, entry);
		const entryStat = statSync(file);

		if (entryStat.isDirectory()) {
			files.push(...findFiles(file));
			continue;
		}

		if (entryStat.isFile()) {
			files.push(file);
		}
	}

	return files;
}

function matchGlob(pattern, file) {
	return matchGlobSegments(pattern.split('/'), file.split('/'));
}

function matchGlobSegments(pattern, file) {
	if (pattern.length === 0) {
		return file.length === 0;
	}

	const [current, ...rest] = pattern;

	if (current === '**') {
		return matchGlobSegments(rest, file) || (file.length > 0 && matchGlobSegments(pattern, file.slice(1)));
	}

	if (file.length === 0) {
		return false;
	}

	return matchGlobSegment(current ?? '', file[0] ?? '') && matchGlobSegments(rest, file.slice(1));
}

function matchGlobSegment(pattern, value) {
	let regexp = '^';

	for (const char of pattern) {
		if (char === '*') {
			regexp += '[^/]*';
			continue;
		}

		if (char === '?') {
			regexp += '[^/]';
			continue;
		}

		regexp += escapeRegExp(char);
	}

	return new RegExp(`${regexp}$`, 'u').test(value);
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function parseLocaleDictionary(content, lang, sourceLabel) {
	const normalized = lang.toLowerCase();

	try {
		if (normalized === 'json') {
			return asDictionary(JSON.parse(content), sourceLabel);
		}

		if (normalized === 'yaml' || normalized === 'yml') {
			return asDictionary(YAML.parse(content) ?? {}, sourceLabel);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to parse ${sourceLabel}: ${message}`);
	}

	throw new Error(`Unsupported locale lang "${lang}" in ${sourceLabel}. Use yaml, yml, or json.`);
}

function asDictionary(value, sourceLabel) {
	if (value == null || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${sourceLabel} must contain an object at the top level.`);
	}

	return value;
}

function createLocaleScopeType(types) {
	return `import("vue-internationalization/runtime").LocaleScope<${toTypeLiteral(types.global ?? {})}, ${toTypeLiteral(types.module ?? {})}>`;
}

function createLocaleRefType(types) {
	return `Readonly<import("vue").ComputedRef<${createLocaleScopeType(types)}>>`;
}

function createLocalizerScopeType(types) {
	return `{ env: ${toLocalizerTypeLiteral(types.global ?? {})}; sfc: ${toLocalizerTypeLiteral(types.module ?? {})}; }`;
}

function createLocalizerRefType(types) {
	return `Readonly<import("vue").ComputedRef<${createLocalizerScopeType(types)}>>`;
}

function toTypeLiteral(dictionary) {
	const entries = Object.entries(dictionary).map(([key, value]) => `${toPropertyName(key)}: ${toType(value)};`);
	return entries.length === 0 ? '{}' : `{ ${entries.join(' ')} }`;
}

function toType(value) {
	if (typeof value === 'string') {
		return 'string';
	}

	if (typeof value === 'number') {
		return 'number';
	}

	if (typeof value === 'boolean') {
		return 'boolean';
	}

	if (value === null) {
		return 'null';
	}

	if (Array.isArray(value)) {
		const itemTypes = [...new Set(value.map((item) => toType(item)))];
		return itemTypes.length === 0 ? 'unknown[]' : `Array<${itemTypes.join(' | ')}>`;
	}

	return toTypeLiteral(value);
}

function toLocalizerTypeLiteral(dictionary) {
	const entries = Object.entries(dictionary).map(([key, value]) => `${toPropertyName(key)}: ${toLocalizerType(value)};`);
	return entries.length === 0 ? 'import("vue-internationalization/runtime").LocaleLocalizerDictionary' : `{ ${entries.join(' ')} }`;
}

function toLocalizerType(value) {
	if (value != null && typeof value === 'object' && !Array.isArray(value)) {
		return toLocalizerTypeLiteral(value);
	}

	return 'import("vue-internationalization/runtime").LocaleTemplateFunction';
}

function toPropertyName(key) {
	return /^[$A-Z_a-z][$\w]*$/.test(key) ? key : JSON.stringify(key);
}
