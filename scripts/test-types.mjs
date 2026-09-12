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
		if (result.status === 0 || (result.stdout.match(/error TS2345/g) ?? []).length !== 6) {
			throw new Error(`Expected six missing-argument errors (script + template, number/plural/select, SFC + env):\n${result.stdout}\n${result.stderr}`);
		}
		writeFileSync(`${temporary}/App.vue`, source.replaceAll('{ n: 1 }', '{ wrong: 1 }').replaceAll('{ kind: \'yes\' }', '{ wrong: \'yes\' }'));
		const wrong = spawnSync('pnpm', ['exec', 'vue-tsc', '--noEmit', '-p', temporary], { encoding: 'utf8' });
		if (wrong.status === 0 || (wrong.stdout.match(/error TS\d+/g) ?? []).length !== 6) {
			throw new Error(`Expected six wrong-argument errors:\n${wrong.stdout}\n${wrong.stderr}`);
		}
	}
	console.log('vue-tsc: documented and compact ICU number/plural/select types accept valid arguments and reject all six missing and wrong argument calls.');
} finally {
	rmSync(temporary, { recursive: true, force: true });
}
