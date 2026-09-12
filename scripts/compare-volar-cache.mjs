import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { build } from 'esbuild';

// Keep the baseline algorithm intact; add only the same observation hooks.
const baselineRef = '404beff';
let baseline = execFileSync('git', ['show', `${baselineRef}:src/volar.ts`], { encoding: 'utf8' });
for (const [from, to] of [
	['export default plugin;', 'export default plugin;\nexport const volarInternals = { createVolarCache, getLocaleDictionary, getGeneratedTypes, getLocaleDiagnostics };'],
	['type VolarCache = {', 'type VolarCache = {\n stats: { scriptParses: number };'],
	['function createVolarCache(): VolarCache {\n\treturn {', 'function createVolarCache(): VolarCache {\n\treturn {\n stats: { scriptParses: 0 },'],
	['const scriptMessages = parseScriptLocaleDictionaries(content, fileName);', 'cache.stats.scriptParses++;\nconst scriptMessages = parseScriptLocaleDictionaries(content, fileName);'],
]) {
	if (baseline.split(from).length !== 2) throw new Error(`Baseline instrumentation no longer matches: ${from}`);
	baseline = baseline.replace(from, to);
}
const directory = mkdtempSync(resolve('node_modules/.cache/vvi-cache-compare-'));
try {
	const filename = `${directory}/baseline.mjs`;
	await build({ stdin: { contents: baseline, resolveDir: resolve('src'), sourcefile: 'volar.ts', loader: 'ts' }, bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: filename });
	const results = [];
	for (let sample = 0; sample < 3; sample++) {
		for (const variant of ['baseline', 'current']) {
			const module = pathToFileURL(variant === 'baseline' ? filename : resolve('dist/volar.js')).href;
			const result = JSON.parse(execFileSync(process.execPath, ['--expose-gc', 'scripts/benchmark-volar-cache.mjs', '1000'], { encoding: 'utf8', env: { ...process.env, VVI_BENCHMARK_MODULE: module } }));
			results.push({ variant, sample, ...result });
		}
	}
	process.stdout.write(JSON.stringify({ baselineRef, currentRef: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), results }, null, 2) + '\n');
} finally {
	rmSync(directory, { recursive: true, force: true });
}
