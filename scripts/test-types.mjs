/* global console */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = resolve('test/fixtures/types');
const source = readFileSync(`${fixture}/App.vue`, 'utf8');
const config = JSON.parse(readFileSync(`${fixture}/tsconfig.json`, 'utf8'));
const temporary = mkdtempSync(resolve('test/fixtures/types-run-'));
try {
	mkdirSync(`${temporary}/node_modules`);
	symlinkSync(resolve('.'), `${temporary}/node_modules/vite-vue-internationalization`, 'dir');
	for (const localizerDocumentation of [true, false]) {
		config.vueCompilerOptions.plugins[0].localizerDocumentation = localizerDocumentation;
		writeFileSync(`${temporary}/tsconfig.json`, JSON.stringify(config));
		writeFileSync(`${temporary}/App.vue`, source);
		execFileSync('pnpm', ['exec', 'vue-tsc', '--noEmit', '-p', temporary], { stdio: 'pipe' });
		writeFileSync(`${temporary}/App.vue`, source.replaceAll('{ n: 1 }', '{}').replaceAll('{ kind: \'yes\' }', '{}'));
		const result = spawnSync('pnpm', ['exec', 'vue-tsc', '--noEmit', '-p', temporary], { encoding: 'utf8' });
		if (result.status === 0 || (result.stdout.match(/error TS2345/g) ?? []).length !== 4) {
			throw new Error(`Expected four missing-argument errors (script + template, SFC + env):\n${result.stdout}\n${result.stderr}`);
		}
	}
	console.log('vue-tsc: documented and compact ICU types accept valid arguments and reject all four invalid calls.');
} finally {
	rmSync(temporary, { recursive: true, force: true });
}
