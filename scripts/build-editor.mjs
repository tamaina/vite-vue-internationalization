import { build } from 'esbuild';
await build({ entryPoints: ['extensions/vscode/src/extension.ts'], bundle: true, platform: 'node', format: 'cjs', alias: { '@vue/compiler-sfc': '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js' }, external: ['vscode'], outfile: 'extensions/vscode/dist/extension.cjs', sourcemap: true });
