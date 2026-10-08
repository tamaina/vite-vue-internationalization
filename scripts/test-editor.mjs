import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { runTests } from '@vscode/test-electron';

const root = mkdtempSync(resolve('test/fixtures/editor-run-'));
// The Codex host may itself run Electron as Node; do not inherit that mode.
delete process.env.ELECTRON_RUN_AS_NODE;
try {
	mkdirSync(`${root}/workspace`);
	mkdirSync(`${root}/external`);
	writeFileSync(`${root}/external/global.yaml`, 'title: [');
	writeFileSync(`${root}/workspace/tsconfig.json`, JSON.stringify({ vueCompilerOptions: { plugins: [{ name: 'vite-vue-internationalization/volar', global: { en: '../external/*.yaml' } }] } }));
	writeFileSync(`${root}/workspace/App.vue`, '<template>Fixture</template>');
	await runTests({ version: '1.95.3', extensionDevelopmentPath: resolve('extensions/vscode'), extensionTestsPath: resolve('extensions/vscode/test/suite.cjs'), launchArgs: [`${root}/workspace`, '--disable-extensions', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', '--user-data-dir', `${root}/profile`, '--extensions-dir', `${root}/extensions`] });
} finally {
	rmSync(root, { recursive: true, force: true });
}
