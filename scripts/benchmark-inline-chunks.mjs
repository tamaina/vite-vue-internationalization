/* global console, process */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { internals } from '../dist/plugin.js';

const require = createRequire(import.meta.url);

const scenarioFactories = {
	'non-localizable-chunks': () => createFixture({
		chunks: 1200,
		localizableChunks: 0,
		locales: 6,
		bodyLines: 24,
		withDynamicImports: false,
	}),
	'localizable-chunks': () => createFixture({
		chunks: 240,
		localizableChunks: 240,
		locales: 6,
		bodyLines: 30,
		withDynamicImports: false,
	}),
	'dynamic-imports': () => createFixture({
		chunks: 320,
		localizableChunks: 180,
		locales: 6,
		bodyLines: 24,
		withDynamicImports: true,
	}),
	'large-js-bodies': () => createFixture({
		chunks: 80,
		localizableChunks: 80,
		locales: 6,
		bodyLines: 420,
		withDynamicImports: true,
	}),
};

const runs = Number.parseInt(process.env.VVI_BENCH_RUNS ?? '8', 10);
const warmups = Number.parseInt(process.env.VVI_BENCH_WARMUPS ?? '3', 10);
const selectedScenarios = (process.env.VVI_BENCH_SCENARIOS ?? Object.keys(scenarioFactories).join(','))
	.split(',')
	.map((name) => name.trim())
	.filter(Boolean);

const viteJson = require('vite/package.json');
const packageJson = require('../package.json');
const rolldownJson = tryRequirePackageJson('rolldown');

console.log(JSON.stringify({
	package: `${packageJson.name}@${packageJson.version}`,
	vite: viteJson.version,
	rolldown: rolldownJson?.version ?? null,
	node: process.version,
	pnpm: getPnpmVersion(),
	runs,
	warmups,
}, undefined, 2));

for (const scenario of selectedScenarios) {
	const create = scenarioFactories[scenario];

	if (!create) {
		throw new Error(`Unknown scenario "${scenario}".`);
	}

	const measurements = [];

	for (let index = 0; index < warmups + runs; index++) {
		const fixture = create();
		const start = performance.now();
		const manifest = internals.inlineLocaleChunks(
			fixture.bundle,
			fixture.locales,
			fixture.primaryLocale,
			fixture.modules,
			fixture.globalMessages,
		);
		const duration = performance.now() - start;

		if (manifest.entries.length !== fixture.expectedEntries) {
			throw new Error(`${scenario}: expected ${fixture.expectedEntries} manifest entries, got ${manifest.entries.length}.`);
		}

		if (index >= warmups) {
			measurements.push(duration);
		}
	}

	const mean = measurements.reduce((sum, value) => sum + value, 0) / measurements.length;
	const sorted = [...measurements].sort((a, b) => a - b);

	console.log(JSON.stringify({
		scenario,
		meanMs: round(mean),
		minMs: round(sorted[0] ?? 0),
		maxMs: round(sorted.at(-1) ?? 0),
		medianMs: round(sorted[Math.floor(sorted.length / 2)] ?? 0),
		runs: measurements.map(round),
	}, undefined, 2));
}

function createFixture({
	chunks,
	localizableChunks,
	locales,
	bodyLines,
	withDynamicImports,
}) {
	const primaryLocale = 'ja-JP';
	const localeNames = Array.from({ length: locales }, (_, index) => index === 0 ? primaryLocale : `en-${index}`);
	const modules = {};
	const bundle = {};

	for (let index = 0; index < chunks; index++) {
		const fileName = `assets/Chunk${index}.js`;
		const isLocalizable = index < localizableChunks;
		const moduleId = `/src/Chunk${index}.vue`;
		const markerCode = isLocalizable
			? internals.injectInlineLocaleBinding('<script setup></script>', moduleId).match(/const \$locale = (.*);/)?.[1] ?? ''
			: '';
		const dynamicImports = withDynamicImports && index + 1 < chunks ? [`assets/Chunk${index + 1}.js`] : [];
		const importExpression = dynamicImports.length > 0
			? `\nimport("./Chunk${index + 1}.js").then((module) => module.default);`
			: '';

		bundle[fileName] = {
			type: 'chunk',
			fileName,
			code: [
				`const chunkIndex = ${index};`,
				`const payload = ${JSON.stringify(createBody(index, bodyLines))};`,
				markerCode ? `const locale = ${markerCode};` : '',
				markerCode ? 'const localizedTitle = locale.value.sfc.title;' : '',
				importExpression,
			].filter(Boolean).join('\n'),
			imports: [],
			dynamicImports,
			viteMetadata: {
				importedAssets: new Set(),
				importedCss: new Set(),
			},
		};

		if (isLocalizable) {
			modules[moduleId] = Object.fromEntries(localeNames.map((locale, localeIndex) => [
				locale,
				{
					title: `title ${index} ${locale}`,
					body: `body ${index} ${localeIndex}`,
				},
			]));
		}
	}

	return {
		bundle,
		locales: localeNames,
		primaryLocale,
		modules,
		globalMessages: {},
		expectedEntries: localizableChunks,
	};
}

function createBody(index, lines) {
	return Array.from({ length: lines }, (_, line) => `chunk ${index} generated body line ${line}`).join('\n');
}

function round(value) {
	return Math.round(value * 1000) / 1000;
}

function getPnpmVersion() {
	try {
		return execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim();
	} catch {
		return null;
	}
}

function tryRequirePackageJson(packageName) {
	try {
		return require(`${packageName}/package.json`);
	} catch {
		return null;
	}
}
