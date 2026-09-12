import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { volarInternals as v } from '../dist/volar.js';

const iterations = Number(process.argv[2] ?? 1000);
if (!Number.isInteger(iterations) || iterations < 1) throw new Error('Expected a positive edit count.');
const cache = v.createVolarCache();
const forcedGc = typeof globalThis.gc === 'function';
if (forcedGc) globalThis.gc();
const before = process.memoryUsage().heapUsed;
const started = performance.now();
for (let revision = 0; revision < iterations; revision++) {
	const content = `<script setup>const revision = ${revision};</script><locale locale="en">title: Revision ${revision}</locale>`;
	const blocks = [{ name: 'locale_0', type: 'locale', attrs: { locale: 'en' }, lang: 'yaml', content: `title: Revision ${revision}` }];
	const dictionary = v.getLocaleDictionary(cache, content, '/App.vue', blocks, 'en');
	v.getLocaleDictionary(cache, content, '/App.vue', blocks, 'en');
	v.getGeneratedTypes(cache, {}, undefined, dictionary);
	v.getLocaleDiagnostics(cache, blocks, 'en', dictionary, '/App.vue');
}
const elapsedMs = performance.now() - started;
if (forcedGc) globalThis.gc();
process.stdout.write(JSON.stringify({ node: process.version, iterations, forcedGc, elapsedMs, heapDelta: process.memoryUsage().heapUsed - before, stats: cache.stats, entries: Object.fromEntries(Object.entries(cache).filter(([, value]) => value instanceof Map).map(([name, value]) => [name, value.size])) }, null, 2) + '\n');
