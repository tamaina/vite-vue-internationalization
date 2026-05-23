import { parse as parseSfc } from '@vue/compiler-sfc';
import YAML from 'yaml';
import { createLocalizerRefType, createUseLocaleTypeParameters, type LocaleBindingTypes } from './localeTypes.js';
import { getScriptSetupOpenTag, injectScriptSetup } from './scriptSetup.js';
import type { LocaleDictionary, ParsedVueLocale, SfcLocaleBlock } from './types.js';

export function parseVueLocales(code: string, filename: string): ParsedVueLocale {
	const result = parseSfc(code, { filename, pad: false });
	const blocks = result.descriptor.customBlocks
		.filter((block) => block.type === 'locale')
		.map((block) => {
			const locale = block.attrs.locale;

			if (typeof locale !== 'string' || locale.length === 0) {
				throw new Error(`<locale> block in ${filename} requires a locale attribute.`);
			}

			const lang = typeof block.attrs.lang === 'string' ? block.attrs.lang : 'yaml';

			const range = findCustomBlockRange(code, block.loc.start.offset, block.loc.end.offset, filename);

			return {
				locale,
				lang,
				content: block.content,
				start: range.start,
				end: range.end,
			};
		});

	return {
		code,
		moduleId: normalizeModuleId(filename),
		blocks,
	};
}

export function parseLocaleDictionary(content: string, lang: string, sourceLabel: string): LocaleDictionary {
	const normalized = lang.toLowerCase();

	try {
		if (normalized === 'json') {
			return validateLocaleDictionary(JSON.parse(content), sourceLabel);
		}

		if (normalized === 'yaml' || normalized === 'yml') {
			return validateLocaleDictionary(YAML.parse(content) ?? {}, sourceLabel);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to parse ${sourceLabel}: ${message}`);
	}

	throw new Error(`Unsupported locale lang "${lang}" in ${sourceLabel}. Use yaml, yml, or json.`);
}

export function validateLocaleDictionary(value: unknown, sourceLabel: string): LocaleDictionary {
	assertSafeDictionary(value, sourceLabel, []);
	return value as LocaleDictionary;
}

export function stripLocaleBlocks(code: string, filename: string): string {
	const { blocks } = parseVueLocales(code, filename);

	if (blocks.length === 0) {
		return code;
	}

	let next = '';
	let cursor = 0;

	for (const block of blocks) {
		next += code.slice(cursor, block.start);
		cursor = block.end;
	}

	next += code.slice(cursor);
	return next;
}

export function injectLocaleBinding(code: string, types: LocaleBindingTypes = {}): string {
	const setupOpenTag = getScriptSetupOpenTag(code);
	const typeParameters = !setupOpenTag || isTypeScriptScript(setupOpenTag) ? createUseLocaleTypeParameters(types) : '';
	const localizerType = !setupOpenTag || isTypeScriptScript(setupOpenTag) ? ` as ${createLocalizerRefType(types)}` : '';
	const injection = [
		'',
		'import { useLocale as __useLocale, useLocalizer as __useLocalizer } from "virtual:vue-internationalization";',
		`const $locale = __useLocale${typeParameters}(import.meta.url);`,
		`const $l = __useLocalizer(import.meta.url)${localizerType};`,
		'',
	].join('\n');

	return injectScriptSetup(code, injection);
}

export function transformVueSfc(code: string, filename: string, types: LocaleBindingTypes = {}): string | undefined {
	const parsed = parseVueLocales(code, filename);

	if (parsed.blocks.length === 0) {
		return undefined;
	}

	return injectLocaleBinding(stripLocaleBlocks(code, filename), {
		...types,
		module: getPrimaryLocaleDictionary(parsed.blocks, types.primaryLocale),
	});
}

export function normalizeModuleId(id: string): string {
	const withoutQuery = id.split('?', 1)[0] ?? id;
	return withoutQuery.replace(/\\/g, '/');
}

function assertSafeDictionary(value: unknown, sourceLabel: string, path: string[]): void {
	if (value == null || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${sourceLabel} must contain an object at the top level.`);
	}

	for (const [key, child] of Object.entries(value)) {
		const currentPath = [...path, key];

		if (isUnsafeDictionaryKey(key)) {
			throw new Error(`${sourceLabel} contains unsafe locale key "${currentPath.join('.')}".`);
		}

		if (Array.isArray(child)) {
			assertSafeLocaleArray(child, sourceLabel, currentPath);
			continue;
		}

		if (child != null && typeof child === 'object') {
			assertSafeDictionary(child, sourceLabel, currentPath);
		}
	}
}

function assertSafeLocaleArray(value: unknown[], sourceLabel: string, path: string[]): void {
	value.forEach((item, index) => {
		const currentPath = [...path, String(index)];

		if (Array.isArray(item)) {
			assertSafeLocaleArray(item, sourceLabel, currentPath);
			return;
		}

		if (item != null && typeof item === 'object') {
			assertSafeDictionary(item, sourceLabel, currentPath);
		}
	});
}

function isUnsafeDictionaryKey(key: string): boolean {
	return key === '__proto__' || key === 'prototype' || key === 'constructor';
}

function findCustomBlockRange(code: string, contentStart: number, contentEnd: number, filename: string) {
	const start = code.lastIndexOf('<locale', contentStart);
	const closeStart = code.indexOf('</locale>', contentEnd);

	if (start < 0 || closeStart < 0) {
		throw new Error(`Unable to locate complete <locale> block in ${filename}.`);
	}

	return {
		start,
		end: closeStart + '</locale>'.length,
	};
}

function getPrimaryLocaleDictionary(blocks: SfcLocaleBlock[], primaryLocale: string | undefined): LocaleDictionary {
	const primaryBlock = primaryLocale ? blocks.find((block) => block.locale === primaryLocale) : undefined;
	const block = primaryBlock ?? (blocks[0] as SfcLocaleBlock);

	return parseLocaleDictionary(block.content, block.lang, `<locale locale="${block.locale}">`);
}

function isTypeScriptScript(scriptOpenTag: string): boolean {
	return /\blang\s*=\s*["']tsx?["']/.test(scriptOpenTag);
}
