import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { loadLocaleEnvDictionaryWithDiagnostics, localeEnvWatchRoots, type LocaleEnvFileDiagnostic } from './localeEnv.js';
import { parseLocaleDictionaryForDiagnostics } from './parse.js';

/** Reads JSONC/extends through TypeScript without executing configured plugins. */
export function collectEditorDiagnostics(configFile: string, readText = (file: string) => readFileSync(file, 'utf8')) {
	const dependencies = new Set<string>();
	const roots = new Set<string>([dirname(configFile)]);
	const diagnostics: LocaleEnvFileDiagnostic[] = [];
	const configDiagnostics: LocaleEnvFileDiagnostic[] = [];
	let configured = false;
	const readFile = (file: string) => {
		dependencies.add(resolve(file));
		try { return readText(resolve(file)); } catch { return undefined; }
	};
	const report = (diagnostic: ts.Diagnostic) => configDiagnostics.push({ fileName: diagnostic.file?.fileName ?? configFile, start: diagnostic.start ?? 0, end: (diagnostic.start ?? 0) + (diagnostic.length ?? 1), message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') });
	const parsed = ts.getParsedCommandLineOfConfigFile(configFile, {}, { ...ts.sys, readDirectory: () => [], readFile, onUnRecoverableConfigFileDiagnostic: report });
	for (const diagnostic of parsed?.errors ?? []) if (![18002, 18003].includes(diagnostic.code)) report(diagnostic);
	for (const file of [...dependencies].reverse()) {
		if (file.endsWith('/package.json')) continue;
		const text = readFile(file);
		if (text === undefined) continue;
		const raw = ts.parseConfigFileTextToJson(file, text).config as unknown;
		if (!record(raw) || !record(raw.vueCompilerOptions) || !Array.isArray(raw.vueCompilerOptions.plugins)) continue;
		for (const plugin of raw.vueCompilerOptions.plugins) {
			if (!record(plugin) || plugin.name !== 'vite-vue-internationalization/volar') continue;
			configured = true;
			if (plugin.global === undefined) continue;
			if (!record(plugin.global)) {
				diagnostics.push({ fileName: file, start: 0, end: 1, message: 'VVI global must be an object keyed by locale.' });
				continue;
			}
			for (const [locale, source] of Object.entries(plugin.global)) {
				if (typeof source === 'string' || Array.isArray(source) && source.every(item => typeof item === 'string')) {
					for (const root of localeEnvWatchRoots(dirname(configFile), source)) roots.add(root);
					const result = loadLocaleEnvDictionaryWithDiagnostics(dirname(configFile), locale, source, { readText });
					diagnostics.push(...result.diagnostics.map(diagnostic => ({ ...diagnostic, fileName: diagnostic.fileName ?? file })));
				} else if (record(source)) {
					const result = parseLocaleDictionaryForDiagnostics(JSON.stringify(source), 'json', `global.${locale}`);
					diagnostics.push(...result.diagnostics.map(diagnostic => ({ ...diagnostic, fileName: file, start: 0, end: 1 })));
				} else diagnostics.push({ fileName: file, start: 0, end: 1, message: `Unsupported global source for ${locale}; use an object, path, or array of paths.` });
			}
		}
	}
	return { diagnostics: configured ? [...configDiagnostics, ...diagnostics] : [], dependencies: [...dependencies], watchRoots: [...roots] };
}

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
