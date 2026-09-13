import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';
import { SourceEdits } from './sourceEdits.js';
import { augmentSsrManifest, createAssetManifest, finalizeAssetIntegrity, localizeAssetManifest } from './assetManifest.js';
import {
	augmentViteManifestJson,
	getInlineLocaleHtmlLoaders,
	hasVueScriptLocaleAccess,
	injectInlineLocaleBinding,
	createInlineLocaleMarker,
	inlineLocaleChunks,
	inlineLocaleHtml,
	replaceInlineLocalizerAccess,
	replaceInlineLocaleMemberAccess,
	replaceInlineLocaleHtml,
	replaceInlineLocaleMarkers,
	replaceInlineLocaleTextAccess,
	collectInlineComponentImports,
	rewriteInlineComponentLocaleAccess,
	rewriteInlineLocaleTemplateAccess,
	rewriteInlineRuntimeLocaleAccess,
	rewriteVueScriptRuntimeLocaleAccess,
	type InlineChunkManifest,
} from './inline.js';
import {
	injectLocaleBinding,
	injectComponentLocaleOptions,
	getPrimaryLocaleDictionary,
	hasLocaleDictionaryEntries,
	hasInjectedLocaleBinding,
	mergeLocaleDictionaries,
	parseLocaleDictionary,
	parseVueLocales,
	stripLocaleBlocks,
	transformVueSfc,
	validateLocaleDictionary,
} from './parse.js';
import { readTextFile, scanVueFiles, type ScanVueFilesOptions } from './files.js';
import { loadLocaleEnvDictionary, localeEnvWatchRoots, matchesLocaleEnvFile, type LocaleEnvSource, type LocaleEnvSources } from './localeEnv.js';
import type { LocaleMessageSyntax } from './message.js';
import type { Environment, Plugin } from 'vite';
import type { LocaleAssetManifest } from './ssr.js';
import type { LocaleDictionary } from './types.js';

export type { LocaleDictionary };

/** Locale dictionaries keyed by locale code. */
export type LocaleMessages = Partial<Record<string, LocaleDictionary>>;
export type { LocaleEnvSource, LocaleEnvSources };
/** Controls which Vue SFC files receive `$locale` and `$l` bindings. */
export type SfcTransformMode = 'locale-sources' | 'all';

/** Options for the Vite plugin and the matching Volar plugin configuration. */
export type VueInternationalizationOptions = {
	/** Locale used as the source of generated TypeScript types. */
	primaryLocale: string;
	/** Global dictionaries keyed by locale code. */
	global?: LocaleEnvSources;
	/** Controls whether locale payloads are loaded as virtual chunks or inlined into locale-specific chunks. */
	buildStrategy?: 'virtual' | 'inline-chunks';
	/** Glob filters used when collecting Vue files at startup. */
	scan?: ScanVueFilesOptions;
	/** Message parser used for string messages in the whole project. */
	messageSyntax?: LocaleMessageSyntax;
	/** Controls which Vue SFC files receive injected `$locale` and `$l` bindings. */
	sfcTransform?: SfcTransformMode;
};
type ResolvedVueInternationalizationOptions = VueInternationalizationOptions;
type TsconfigVueCompilerPlugin = {
	name?: unknown;
	primaryLocale?: unknown;
	global?: unknown;
	buildStrategy?: unknown;
	scan?: unknown;
	messageSyntax?: unknown;
	sfcTransform?: unknown;
};

type ModuleMessages = Partial<Record<string, LocaleMessages>>;

const ICU_FORMATTER_ID = '\0vvi-icu-formatter';
const VIRTUAL_ID = 'virtual:vite-vue-internationalization';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;
const LOCALE_PREFIX = 'virtual:vite-vue-internationalization/locale/';
const RESOLVED_LOCALE_PREFIX = `\0${LOCALE_PREFIX}`;
const TSCONFIG_PLUGIN_NAMES = new Set(['vite-vue-internationalization', 'vite-vue-internationalization/volar']);

/**
 * Creates the Vite plugin that collects SFC locale blocks and script-defined
 * dictionaries, then exposes them through `virtual:vite-vue-internationalization`.
 *
 * When options are omitted, the plugin reads the matching
 * `vite-vue-internationalization/volar` entry from the Vite root `tsconfig.json`.
 */
export function vueInternationalization(options?: Partial<VueInternationalizationOptions>): Plugin {
	type State = {
		modules: ModuleMessages;
		globalMessages: LocaleMessages;
		inlineManifest?: InlineChunkManifest;
		assetManifest?: LocaleAssetManifest;
		scanned: boolean;
		failed?: boolean;
		icuFormatterReference?: string;
		localeHash?: string;
	};
	const createState = (): State => ({ modules: {}, globalMessages: {}, scanned: false });
	const states = new WeakMap<Environment, State>();
	const fallbackState = createState();
	let root = process.cwd();
	let command: 'build' | 'serve' = 'serve';
	let resolvedOptions: ResolvedVueInternationalizationOptions | undefined;
	let base = '/';
	let legacyServerBuild = false;

	function getState(context?: { environment?: Environment }): State {
		if (!context?.environment) return fallbackState;
		let state = states.get(context.environment);
		if (!state) { state = createState(); states.set(context.environment, state); }
		return state;
	}

	function environmentOptions(context?: { environment?: Environment }): ResolvedVueInternationalizationOptions {
		const current = getResolvedOptions(resolvedOptions);
		const server = context?.environment ? context.environment.config.consumer === 'server' : legacyServerBuild;
		return server ? { ...current, buildStrategy: 'virtual' } : current;
	}

	function collectVueFile(state: State, filename: string, code: string): void {
		const { modules } = state;
		const parsed = parseVueLocales(code, filename);

		if (parsed.blocks.length === 0 && Object.keys(parsed.scriptMessages).length === 0) {
			delete modules[toRuntimeModuleId(filename, root)];
			return;
		}

		const messages: LocaleMessages = {};

		for (const block of parsed.blocks) {
			messages[block.locale] = mergeLocaleDictionaries(
				messages[block.locale] ?? {},
				parseLocaleDictionary(block.content, block.lang, `${filename}<locale locale="${block.locale}">`),
			);
		}

		for (const [locale, dictionary] of Object.entries(parsed.scriptMessages)) {
			messages[locale] = mergeLocaleDictionaries(messages[locale] ?? {}, dictionary ?? {});
		}

		modules[toRuntimeModuleId(filename, root)] = messages;
	}

	function loadGlobalMessages(state: State): void {
		const { globalMessages } = state;
		for (const locale of Object.keys(globalMessages)) {
			delete globalMessages[locale];
		}

		const currentOptions = getResolvedOptions(resolvedOptions);

		if (!currentOptions.global) {
			return;
		}

		for (const [locale, value] of Object.entries(currentOptions.global)) {
			if (typeof value === 'string' || Array.isArray(value)) {
				globalMessages[locale] = loadLocaleEnvDictionary(root, locale, value);
				continue;
			}

			globalMessages[locale] = value;
		}
	}

	function scan(state: State): void {
		for (const key of Object.keys(state.modules)) delete state.modules[key];
		loadGlobalMessages(state);

		for (const file of scanVueFiles(root, getResolvedOptions(resolvedOptions).scan)) {
			collectVueFile(state, file, readTextFile(file));
		}

		state.scanned = true;
	}

	function ensureScanned(state: State): void {
		if (!state.scanned) {
			scan(state);
		}
	}

	return {
		name: 'vite-vue-internationalization',
		enforce: 'pre',
		perEnvironmentStartEndDuringDev: true,
		sharedDuringBuild: true,
		configResolved(config) {
			root = config.root;
			command = config.command;
			legacyServerBuild = Boolean(config.build.ssr);
			base = config.base;
			resolvedOptions = resolveOptions(root, options);
		},
		configureServer(server) {
			for (const source of Object.values(getResolvedOptions(resolvedOptions).global ?? {})) {
				if (typeof source === 'string' || Array.isArray(source)) server.watcher.add(localeEnvWatchRoots(root, source));
			}
		},
		buildStart() {
			const state = getState(this);
			state.localeHash = undefined;
			state.inlineManifest = undefined;
			state.assetManifest = undefined;
			state.icuFormatterReference = undefined;
			scan(state);
			const currentOptions = environmentOptions(this);
			if (command === 'build' && currentOptions.buildStrategy === 'inline-chunks' && currentOptions.messageSyntax === 'icu') {
				state.icuFormatterReference = this.emitFile({ type: 'chunk', id: ICU_FORMATTER_ID, name: 'vvi-icu-formatter', preserveSignature: 'strict' });
			}
		},
		resolveId(id) {
			if (id === ICU_FORMATTER_ID) return id;
			if (id === VIRTUAL_ID) {
				return RESOLVED_VIRTUAL_ID;
			}

			if (id.startsWith(LOCALE_PREFIX)) {
				return `${RESOLVED_LOCALE_PREFIX}${id.slice(LOCALE_PREFIX.length)}`;
			}

			return null;
		},
		load(id) {
			const state = getState(this);
			const { modules, globalMessages } = state;
			if (id === ICU_FORMATTER_ID) return 'export { formatLocaleMessage as format } from "vite-vue-internationalization/runtime";';
			ensureScanned(state);
			const currentOptions = environmentOptions(this);

			if (id === RESOLVED_VIRTUAL_ID) {
				if (command === 'build' && currentOptions.buildStrategy === 'inline-chunks') {
					return generateInlineRuntimeModule(currentOptions.primaryLocale, getLocales(modules, globalMessages), currentOptions.messageSyntax);
				}

				return generateRuntimeModule(currentOptions.primaryLocale, getLocales(modules, globalMessages), currentOptions.messageSyntax);
			}

			if (id.startsWith(RESOLVED_LOCALE_PREFIX)) {
				const locale = decodeURIComponent(id.slice(RESOLVED_LOCALE_PREFIX.length));
				return generateLocaleModule(locale, currentOptions.primaryLocale, modules, globalMessages);
			}

			return null;
		},
		transform: {
			filter: {
				id: /\.(?:vue|[cm]?[jt]sx?)(?:\?.*)?$/u,
			},
			async handler(code, id) {
				const state = getState(this);
				const { globalMessages } = state;
				const cleanId = id.split('?')[0] ?? id;
				const query = new URLSearchParams(id.slice(cleanId.length + 1));

				// These requests contain a block or an asset representation, not an SFC.
				if (query.has('vue') || query.has('raw') || query.has('url')) {
					return null;
				}

				if (!existsSync(cleanId)) {
					return null;
				}

				const currentOptions = environmentOptions(this);
				const importedDictionaries = new Map<string, string>();
				if (command === 'build' && currentOptions.buildStrategy === 'inline-chunks' && /\$(?:locale|l)\b/.test(code)) {
					for (const [name, source] of collectInlineComponentImports(code, cleanId)) {
						const sourceQuery = new URLSearchParams(source.split('?')[1]);
						if (['raw', 'url', 'vue'].some(key => sourceQuery.has(key))) continue;
						const resolved = await this.resolve(source, cleanId, { skipSelf: true });
						if (!resolved || resolved.external || resolved.id.startsWith('\0')) continue;
						const [file, queryString] = resolved.id.split('?');
						const resolvedQuery = new URLSearchParams(queryString);
						if (!file.endsWith('.vue') || ['raw', 'url', 'vue'].some(key => resolvedQuery.has(key)) || !existsSync(file)) continue;
						collectVueFile(state, file, readTextFile(file));
						const moduleId = toRuntimeModuleId(file, root);
						if (state.modules[moduleId]) {
							this.addWatchFile(file);
							importedDictionaries.set(name, moduleId);
						}
					}
				}

				if (!cleanId.endsWith('.vue')) {
					if (command !== 'build' || currentOptions.buildStrategy !== 'inline-chunks') {
						return null;
					}

					const edits = new SourceEdits(code, cleanId);
					const imported = rewriteInlineComponentLocaleAccess(code, cleanId, root, edits, importedDictionaries);
					const transformed = rewriteInlineRuntimeLocaleAccess(imported, toRuntimeModuleId(cleanId, root), cleanId, edits);
					return transformed === code
						? null
						: {
							code: transformed,
							map: edits.generateMap(),
						};
				}

				collectVueFile(state, cleanId, code);
				const sourceEdits = new SourceEdits(code, cleanId);
				const transformed =
					command === 'build' && currentOptions.buildStrategy === 'inline-chunks'
						? transformVueSfcInline(code, cleanId, root, currentOptions.primaryLocale, currentOptions.sfcTransform === 'all', sourceEdits, importedDictionaries)
						: transformVueSfc(code, id, {
							primaryLocale: currentOptions.primaryLocale,
							global: globalMessages[currentOptions.primaryLocale],
							messageSyntax: currentOptions.messageSyntax,
							transformAll: currentOptions.sfcTransform === 'all',
							moduleExpression: JSON.stringify(toRuntimeModuleId(cleanId, root)),
							edits: sourceEdits,
						});

				if (!transformed) {
					return null;
				}

				return {
					code: transformed,
					map: sourceEdits.generateMap(),
				};
			},
		},
		async hotUpdate(context) {
			const state = getState(this);
			const currentOptions = environmentOptions(this);
			const moduleId = toRuntimeModuleId(context.file, root);
			const sfc = context.file.endsWith('.vue') && (Object.hasOwn(state.modules, moduleId) || scanVueFiles(root, currentOptions.scan).includes(context.file));
			const global = Object.values(currentOptions.global ?? {}).some(source =>
				(typeof source === 'string' || Array.isArray(source)) && matchesLocaleEnvFile(root, context.file, source),
			);
			if (!sfc && !global) return;
			const before = serializeLocaleValue([state.modules, state.globalMessages]);
			const recovering = state.failed;
			const invalidate = () => {
				const modules = new Set(context.modules);
				for (const [id, module] of this.environment.moduleGraph.idToModuleMap) {
					if (id === RESOLVED_VIRTUAL_ID || id.startsWith(RESOLVED_LOCALE_PREFIX)) modules.add(module);
				}
				for (const module of modules) this.environment.moduleGraph.invalidateModule(module, new Set(), context.timestamp, true);
			};
			try {
				if (sfc) {
					if (context.type === 'delete') delete state.modules[moduleId];
					else collectVueFile(state, context.file, await context.read());
				}
				if (global) loadGlobalMessages(state);
				state.failed = false;
			} catch (error) {
				state.failed = true;
				state.scanned = false;
				invalidate();
				this.environment.hot.send({ type: 'error', err: { message: String(error), stack: error instanceof Error ? error.stack ?? '' : '', plugin: 'vite-vue-internationalization' } });
				return [];
			}
			if (!recovering && before === serializeLocaleValue([state.modules, state.globalMessages])) return;
			invalidate();
			if (this.environment.config.consumer === 'client') this.environment.hot.send({ type: 'full-reload' });
			return [];
		},

		augmentChunkHash() {
			const state = getState(this);
			const { modules, globalMessages } = state;
			const currentOptions = environmentOptions(this);
			if (currentOptions.buildStrategy !== 'inline-chunks') return;
			state.localeHash ??= createLocaleHash(['vvi-inline-output-v9', modules, globalMessages, currentOptions.primaryLocale, currentOptions.messageSyntax, this.environment.config.build.sourcemap]);
			return state.localeHash;
		},
		generateBundle(_outputOptions, bundle) {
			const state = getState(this);
			const { modules, globalMessages } = state;
			ensureScanned(state);
			const currentOptions = environmentOptions(this);
			const client = this.environment.config.consumer === 'client';
			const assetManifest = client ? createAssetManifest(bundle, root, base, currentOptions.primaryLocale, getLocales(modules, globalMessages)) : undefined;

			if (currentOptions.buildStrategy === 'inline-chunks') {
				state.inlineManifest = inlineLocaleChunks(
					bundle as Record<string, unknown>,
					getLocales(modules, globalMessages),
					currentOptions.primaryLocale,
					modules,
					globalMessages,
					currentOptions.messageSyntax,
					{
						base,
						icuFormatterFile: state.icuFormatterReference ? this.getFileName(state.icuFormatterReference) : undefined,
						emitAsset: asset => { this.emitFile({ type: 'asset', fileName: asset.fileName, source: asset.source }); },
						emitChunk: chunk => {
							this.emitFile({
								type: 'asset',
								fileName: chunk.fileName,
								source: chunk.code,
							});
						},
					},
				);
				inlineLocaleHtml(bundle as Record<string, unknown>, state.inlineManifest, {
					base,
					emitAsset: asset => {
						this.emitFile({
							type: 'asset',
							fileName: asset.fileName,
							source: asset.source,
						});
					},
				});
			}
			if (assetManifest) {
				if (state.inlineManifest) localizeAssetManifest(assetManifest, state.inlineManifest);
				state.assetManifest = assetManifest;
				this.emitFile({ type: 'asset', fileName: '.vite/internationalization-manifest.json', source: JSON.stringify(assetManifest, null, 2) + '\n' });
			}
		},
		writeBundle(outputOptions, bundle) {
			const state = getState(this);
			const outputDir = resolve(root, outputOptions.dir ?? dirname(outputOptions.file ?? 'dist/index.js'));
			if (state.inlineManifest) {
				rewriteWrittenHtml(outputDir, state.inlineManifest, base);
				const manifestOption = this.environment.config.build.manifest;
				if (manifestOption) rewriteWrittenViteManifest(outputDir, state.inlineManifest, typeof manifestOption === 'string' ? manifestOption : '.vite/manifest.json');
			}
			if (state.assetManifest) {
				finalizeAssetIntegrity(state.assetManifest, outputDir, bundle);
				writeFileSync(resolve(outputDir, '.vite/internationalization-manifest.json'), JSON.stringify(state.assetManifest, null, 2) + '\n');
			}
			const ssrManifestOption = this.environment.config.build.ssrManifest;
			const ssrManifestPath = resolve(outputDir, typeof ssrManifestOption === 'string' ? ssrManifestOption : '.vite/ssr-manifest.json');
			if (ssrManifestOption && state.assetManifest && existsSync(ssrManifestPath)) {
				writeFileSync(ssrManifestPath, augmentSsrManifest(readTextFile(ssrManifestPath), state.assetManifest));
			}
		},
	};
}

export const internals = {
	createLocaleHash,
	generateLocaleModule,
	generateInlineRuntimeModule,
	generateRuntimeModule,
	loadLocaleEnvDictionary,
	resolveOptions,
	augmentViteManifestJson,
	injectLocaleBinding,
	injectInlineLocaleBinding,
	inlineLocaleChunks,
	inlineLocaleHtml,
	replaceInlineLocalizerAccess,
	replaceInlineLocaleMemberAccess,
	replaceInlineLocaleHtml,
	replaceInlineLocaleMarkers,
	replaceInlineLocaleTextAccess,
	rewriteInlineComponentLocaleAccess,
	rewriteInlineLocaleTemplateAccess,
	rewriteInlineRuntimeLocaleAccess,
	rewriteVueScriptRuntimeLocaleAccess,
	stripLocaleBlocks,
	transformVueSfcInline,
};

function resolveOptions(root: string, options: Partial<VueInternationalizationOptions> | undefined): ResolvedVueInternationalizationOptions {
	const tsconfigOptions = readTsconfigOptions(root);
	const merged = {
		...tsconfigOptions,
		...options,
	};

	if (!merged.primaryLocale) {
		throw new Error(
			'vite-vue-internationalization requires a primaryLocale. Pass vueInternationalization({ primaryLocale }) or configure vueCompilerOptions.plugins in tsconfig.json.',
		);
	}

	return {
		primaryLocale: merged.primaryLocale,
		global: merged.global,
		buildStrategy: merged.buildStrategy,
		scan: merged.scan,
		messageSyntax: merged.messageSyntax ?? 'vue',
		sfcTransform: merged.sfcTransform ?? 'locale-sources',
	};
}

function readTsconfigOptions(root: string): Partial<VueInternationalizationOptions> {
	const file = resolve(root, 'tsconfig.json');

	if (!existsSync(file)) {
		return {};
	}

	const parsed = parseJsonFile(file);
	const plugins = getObject(parsed)?.vueCompilerOptions;
	const pluginList = getObject(plugins)?.plugins;

	if (!Array.isArray(pluginList)) {
		return {};
	}

	const plugin = pluginList
		.map((item) => getObject(item) as TsconfigVueCompilerPlugin | undefined)
		.find((item) => typeof item?.name === 'string' && TSCONFIG_PLUGIN_NAMES.has(item.name));

	if (!plugin) {
		return {};
	}

	return normalizeTsconfigPluginOptions(plugin, file);
}

function normalizeTsconfigPluginOptions(
	plugin: TsconfigVueCompilerPlugin,
	sourceFile: string,
): Partial<VueInternationalizationOptions> {
	const result: Partial<VueInternationalizationOptions> = {};

	if (typeof plugin.primaryLocale === 'string') {
		result.primaryLocale = plugin.primaryLocale;
	}

	if (plugin.global !== undefined) {
		result.global = normalizeGlobalOption(plugin.global, sourceFile);
	}

	if (plugin.buildStrategy === 'virtual' || plugin.buildStrategy === 'inline-chunks') {
		result.buildStrategy = plugin.buildStrategy;
	}

	if (plugin.scan !== undefined) {
		result.scan = normalizeScanOption(plugin.scan, sourceFile);
	}

	if (plugin.messageSyntax === 'vue' || plugin.messageSyntax === 'icu') {
		result.messageSyntax = plugin.messageSyntax;
	}

	if (plugin.sfcTransform === 'locale-sources' || plugin.sfcTransform === 'all') {
		result.sfcTransform = plugin.sfcTransform;
	}

	return result;
}

function normalizeScanOption(value: unknown, sourceFile: string): ScanVueFilesOptions {
	const scan = getObject(value);

	if (!scan) {
		throw new Error(`${sourceFile}: vite-vue-internationalization scan option must be an object.`);
	}

	const result: ScanVueFilesOptions = {};

	if (scan.include !== undefined) {
		result.include = normalizeStringOrStringArray(scan.include, `${sourceFile}: scan.include`);
	}

	if (scan.exclude !== undefined) {
		result.exclude = normalizeStringOrStringArray(scan.exclude, `${sourceFile}: scan.exclude`);
	}

	return result;
}

function normalizeGlobalOption(value: unknown, sourceFile: string): LocaleEnvSources {
	const global = getObject(value);

	if (!global) {
		throw new Error(`${sourceFile}: vite-vue-internationalization global option must be an object.`);
	}

	const result: LocaleEnvSources = {};

	for (const [locale, messages] of Object.entries(global)) {
		if (typeof messages === 'string' || isStringArray(messages)) {
			result[locale] = messages;
			continue;
		}

		result[locale] = normalizeLocaleDictionary(messages, `${sourceFile}: global.${locale}`);
	}

	return result;
}

function normalizeLocaleDictionary(value: unknown, sourceLabel: string): LocaleDictionary {
	const dictionary = getObject(value);

	if (!dictionary) {
		throw new Error(`${sourceLabel} must be an object or file path.`);
	}

	return validateLocaleDictionary(dictionary, sourceLabel);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function normalizeStringOrStringArray(value: unknown, sourceLabel: string): string | string[] {
	if (typeof value === 'string' || isStringArray(value)) {
		return value;
	}

	throw new Error(`${sourceLabel} must be a string or string array.`);
}

function parseJsonFile(file: string): unknown {
	const parsed = ts.parseConfigFileTextToJson(file, readFileSync(file, 'utf8'));

	if (parsed.error) {
		const message = ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n');
		throw new Error(`Failed to parse ${file}: ${message}`);
	}

	return parsed.config;
}

function getObject(value: unknown): Record<string, unknown> | undefined {
	return value != null && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: undefined;
}

function getResolvedOptions(options: ResolvedVueInternationalizationOptions | undefined): ResolvedVueInternationalizationOptions {
	if (!options) {
		throw new Error('vite-vue-internationalization options were used before Vite config was resolved.');
	}

	return options;
}

function getLocales(modules: ModuleMessages, global: LocaleMessages): string[] {
	const locales = new Set<string>(Object.keys(global));

	for (const moduleMessages of Object.values(modules)) {
		for (const locale of Object.keys(moduleMessages ?? {})) {
			locales.add(locale);
		}
	}

	return [...locales].sort();
}

function generateRuntimeModule(primaryLocale: string, locales: string[], messageSyntax: LocaleMessageSyntax = 'vue'): string {
	const loaders = Object.fromEntries(
		locales.map((locale) => [
			locale,
			`() => import(${JSON.stringify(`${LOCALE_PREFIX}${encodeURIComponent(locale)}`)})`,
		]),
	);

	const loaderEntries = Object.entries(loaders)
		.map(([locale, expression]) => `${JSON.stringify(locale)}: ${expression}`)
		.join(',\n  ');

	return [
		'import { Internationalization, createComponentLocale, createComponentLocalizer, createInternationalization as __createInternationalization, defineInternationalization, setActiveInternationalization, useDateTimeFormat, useInternationalization, useLocale, useLocalizer, useNumberFormat } from "vite-vue-internationalization/runtime";',
		`export const primaryLocale = ${JSON.stringify(primaryLocale)};`,
		`export const locales = ${JSON.stringify(locales)};`,
		`export const localeLoaders = {\n  ${loaderEntries}\n};`,
		'export function resolveInitialLocale() {',
		'  const handedOff = typeof document !== "undefined" ? document.documentElement.getAttribute("data-vvi-locale") : null;',
		'  if (handedOff !== null) {',
		'    if (!locales.includes(handedOff)) throw new Error(`Unsupported SSR locale: ${handedOff}`);',
		'    return handedOff;',
		'  }',
		'  if (typeof window !== "undefined") {',
		'    const locale = new URL(window.location.href).searchParams.get("locale");',
		'    if (locale && locales.includes(locale)) return locale;',
		'  }',
		'  return primaryLocale;',
		'}',
		'export const currentLocale = resolveInitialLocale();',
		'export { Internationalization, createComponentLocale, createComponentLocalizer, defineInternationalization, setActiveInternationalization, useDateTimeFormat, useInternationalization, useLocale, useLocalizer, useNumberFormat };',
		'export function createInternationalization(options = {}) {',
		'  return __createInternationalization({',
		'    primaryLocale,',
		'    initialLocale: options.initialLocale ?? currentLocale,',
		'    loaders: localeLoaders,',
		'    fallbackLocale: options.fallbackLocale ?? primaryLocale,',
		`    messageSyntax: options.messageSyntax ?? ${JSON.stringify(messageSyntax)},`,
		'    dateTimeFormats: options.dateTimeFormats,',
		'    numberFormats: options.numberFormats',
		'  });',
		'}',
	].join('\n');
}

function generateInlineRuntimeModule(primaryLocale: string, locales: string[], messageSyntax: LocaleMessageSyntax = 'vue'): string {
	const loaderEntries = locales
		.map((locale) => `${JSON.stringify(locale)}: () => Promise.resolve({ global: {}, modules: {} })`)
		.join(',\n  ');

	return [
		'import { Internationalization, createComponentLocale, createComponentLocalizer, createInternationalization as __createInternationalization, defineInternationalization, setActiveInternationalization, useDateTimeFormat, useInternationalization, useLocale, useLocalizer, useNumberFormat } from "vite-vue-internationalization/runtime";',
		`export const primaryLocale = ${JSON.stringify(primaryLocale)};`,
		`export const locales = ${JSON.stringify(locales)};`,
		`export const localeLoaders = {\n  ${loaderEntries}\n};`,
		'export { Internationalization, createComponentLocale, createComponentLocalizer, defineInternationalization, setActiveInternationalization, useDateTimeFormat, useInternationalization, useLocale, useLocalizer, useNumberFormat };',
		'export function resolveInitialLocale() {',
		'  const handedOff = typeof document !== "undefined" ? document.documentElement.getAttribute("data-vvi-locale") : null;',
		'  if (handedOff !== null) {',
		'    if (!locales.includes(handedOff)) throw new Error(`Unsupported SSR locale: ${handedOff}`);',
		'    return handedOff;',
		'  }',
		'  if (typeof window === "undefined") return primaryLocale;',
		'  const locale = new URL(window.location.href).searchParams.get("locale");',
		'  return locale && locales.includes(locale) ? locale : primaryLocale;',
		'}',
		'export const currentLocale = resolveInitialLocale();',
		'export function createInternationalization(options = {}) {',
		'  return __createInternationalization({',
		'    primaryLocale,',
		'    initialLocale: options.initialLocale ?? currentLocale,',
		'    loaders: localeLoaders,',
		'    fallbackLocale: options.fallbackLocale ?? primaryLocale,',
		`    messageSyntax: options.messageSyntax ?? ${JSON.stringify(messageSyntax)},`,
		'    dateTimeFormats: options.dateTimeFormats,',
		'    numberFormats: options.numberFormats',
		'  });',
		'}',
	].join('\n');
}

function generateLocaleModule(locale: string, primaryLocale: string, modules: ModuleMessages, global: LocaleMessages): string {
	const localeModules: Record<string, LocaleDictionary> = {};

	for (const [moduleId, messages] of Object.entries(modules)) {
		const module = mergeLocaleDictionaries(messages?.[primaryLocale] ?? {}, messages?.[locale] ?? {});

		if (Object.keys(module).length > 0) {
			localeModules[moduleId] = module;
		}
	}

	return [
		`export const locale = ${JSON.stringify(locale)};`,
		`export const global = ${serializeLocaleValue(mergeLocaleDictionaries(global[primaryLocale] ?? {}, global[locale] ?? {}))};`,
		`export const modules = ${serializeLocaleValue(localeModules)};`,
		'export default { locale, global, modules };',
	].join('\n');
}

// Tag every node, not only functions: a user dictionary can contain any marker key.
function createLocaleHash(value: unknown): string {
	function encode(value: unknown): unknown {
		if (typeof value === 'function') return ['function', value.toString()];
		if (Array.isArray(value)) return ['array', value.map(encode)];
		if (value !== null && typeof value === 'object') return ['object', Object.keys(value).sort().map(key => [key, encode((value as Record<string, unknown>)[key])])];
		if (typeof value === 'number') return ['number', Object.is(value, -0) ? '-0' : String(value)];
		return [typeof value, value];
	}

	return createHash('sha256').update(JSON.stringify(encode(value))).digest('hex');
}

function serializeLocaleValue(value: unknown): string {
	if (typeof value === 'function') {
		return `(${value.toString()})`;
	}

	if (Array.isArray(value)) {
		return `[${value.map((item) => serializeLocaleValue(item)).join(',')}]`;
	}

	if (value != null && typeof value === 'object') {
		return `{${Object.entries(value)
			.map(([key, child]) => `${toObjectPropertyName(key)}:${serializeLocaleValue(child)}`)
			.join(',')}}`;
	}

	return JSON.stringify(value);
}

function toObjectPropertyName(key: string): string {
	return JSON.stringify(key);
}

function toRuntimeModuleId(filename: string, root: string): string {
	const relativePath = relative(root, filename).replace(/\\/g, '/');
	return `/${relativePath}`;
}

function transformVueSfcInline(code: string, filename: string, root: string, primaryLocale?: string, transformAll = false, edits?: SourceEdits, importedDictionaries?: Map<string, string>): string | undefined {
	if (hasInjectedLocaleBinding(code) || code.includes('__VUE_INTERNATIONALIZATION_INLINE_LOCALE__')) {
		return undefined;
	}

	const parsed = parseVueLocales(code, filename);

	if (!transformAll && parsed.blocks.length === 0 && Object.keys(parsed.scriptMessages).length === 0) {
		const rewritten = rewriteInlineComponentLocaleAccess(code, filename, root, edits, importedDictionaries);
		return rewritten === code ? undefined : rewritten;
	}

	const moduleId = toRuntimeModuleId(filename, root);
	const marker = createInlineLocaleMarker(moduleId);
	const stripped = stripLocaleBlocks(code, filename, edits);
	const rewrittenComponentAccess = rewriteInlineComponentLocaleAccess(stripped, filename, root, edits, importedDictionaries);
	const rewrittenLocaleAccess = rewriteInlineLocaleTemplateAccess(rewrittenComponentAccess, moduleId, edits);
	const rewrittenRuntimeAccess = rewriteVueScriptRuntimeLocaleAccess(rewrittenLocaleAccess, moduleId, edits);
	const moduleDictionary = getPrimaryLocaleDictionary(parsed.blocks, primaryLocale, parsed.scriptMessages);

	if (!hasLocaleDictionaryEntries(moduleDictionary)) {
		return hasVueScriptLocaleAccess(rewrittenRuntimeAccess)
			? injectInlineLocaleBinding(rewrittenRuntimeAccess, moduleId, edits)
			: rewrittenRuntimeAccess;
	}

	const withSetupBinding = injectInlineLocaleBinding(rewrittenRuntimeAccess, moduleId, edits);

	return injectComponentLocaleOptions(withSetupBinding, filename, {
		module: moduleDictionary,
	}, {
		importLine: '',
		edits,
		localeExpression: `__VUE_INTERNATIONALIZATION_INLINE_LOCALE__(${JSON.stringify(marker)}).sfc`,
		localizerExpression: `__VUE_INTERNATIONALIZATION_INLINE_LOCALIZERS__(${JSON.stringify(marker)}).sfc`,
	});
}

function rewriteWrittenHtml(outDir: string, manifest: InlineChunkManifest, base: string): void {
	const writtenLoaders = new Set<string>();

	for (const file of findHtmlFiles(outDir)) {
		const html = readFileSync(file, 'utf8');
		const fileName = relative(outDir, file);
		for (const loader of getInlineLocaleHtmlLoaders(html, manifest, fileName, base)) {
			if (writtenLoaders.has(loader.fileName)) {
				continue;
			}

			writeFileSync(resolve(outDir, loader.fileName), loader.source);
			writtenLoaders.add(loader.fileName);
		}

		const next = replaceInlineLocaleHtml(html, manifest, fileName, base);

		if (next !== html) {
			writeFileSync(file, next);
		}
	}
}

function rewriteWrittenViteManifest(outDir: string, manifest: InlineChunkManifest, manifestFile: string): void {
	const file = resolve(outDir, manifestFile);
	if (!existsSync(file)) return;
	const source = readFileSync(file, 'utf8');
	const next = augmentViteManifestJson(source, manifest);
	if (next !== source) writeFileSync(file, next);
}

function findHtmlFiles(dir: string): string[] {
	if (!existsSync(dir)) {
		return [];
	}

	const files: string[] = [];

	for (const entry of readdirSync(dir)) {
		const path = resolve(dir, entry);
		const stat = statSync(path);

		if (stat.isDirectory()) {
			files.push(...findHtmlFiles(path));
			continue;
		}

		if (stat.isFile() && path.endsWith('.html')) {
			files.push(path);
		}
	}

	return files;
}
