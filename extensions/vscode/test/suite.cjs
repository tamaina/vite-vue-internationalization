/* global require, exports, setTimeout, clearTimeout */
/* eslint-disable @typescript-eslint/no-require-imports -- VS Code loads a CommonJS test runner. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');

exports.run = async function () {
	const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
	const external = path.resolve(root, '../external/global.yaml');
	const uri = vscode.Uri.file(external);
	const extension = vscode.extensions.getExtension('tamaina.vite-vue-internationalization-tools');
	assert.ok(extension);
	const api = await extension.activate();
	const own = uri => vscode.languages.getDiagnostics(uri).filter(item => item.source === 'VVI');

	async function expectDiagnostics(uri, count, change = async () => {}) {
		await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => { listener.dispose(); reject(new Error(`Expected ${count} VVI diagnostics for ${uri.fsPath}, got ${JSON.stringify(own(uri))}`)); }, 15000);
			const check = () => { if (own(uri).length === count) { clearTimeout(timeout); listener.dispose(); resolve(); } };
			const listener = vscode.languages.onDidChangeDiagnostics(check);
			void change().then(check, error => { clearTimeout(timeout); listener.dispose(); reject(error); });
		});
	}

	await expectDiagnostics(uri, 1);
	const document = await vscode.workspace.openTextDocument(uri);
	await expectDiagnostics(uri, 0, async () => {
		const edit = new vscode.WorkspaceEdit();
		edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), 'title: corrected');
		assert.equal(await vscode.workspace.applyEdit(edit), true);
	});
	assert.equal(document.isDirty, true, 'Correction must work before saving.');
	await document.save();
	await expectDiagnostics(uri, 1, () => fs.writeFile(external, 'title: ['));
	await expectDiagnostics(uri, 0, () => fs.writeFile(external, 'title: corrected again'));
	const added = vscode.Uri.file(path.resolve(root, '../external/added.yaml'));
	await expectDiagnostics(added, 1, () => fs.writeFile(added.fsPath, '- invalid top-level'));
	await expectDiagnostics(added, 0, () => fs.unlink(added.fsPath));
	await expectDiagnostics(uri, 1, () => fs.writeFile(external, 'constructor: unsafe'));
	await expectDiagnostics(uri, 0, () => fs.writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ vueCompilerOptions: { plugins: [] } })));
	const json = vscode.Uri.file(path.resolve(root, '../external/other.json'));
	await fs.writeFile(json.fsPath, '{\n "title": nope\n}');
	await expectDiagnostics(json, 1, () => fs.writeFile(path.join(root, 'tsconfig.second.json'), JSON.stringify({ vueCompilerOptions: { plugins: [{ name: 'vite-vue-internationalization/volar', global: { en: '../external/other.json' } }] } })));
	assert.equal(own(json)[0].range.start.line, 1, 'JSON error must point at the offending line.');
	assert.equal(own(uri).length, 0, 'The second project must not revive the first project diagnostics.');
	await expectDiagnostics(json, 0, () => fs.writeFile(json.fsPath, '{"title":"fixed"}'));
	const inherited = path.resolve(root, '../external/base.json');
	await fs.writeFile(inherited, JSON.stringify({ vueCompilerOptions: { plugins: [{ name: 'vite-vue-internationalization/volar', global: { en: '../external/global.yaml' } }] } }));
	await expectDiagnostics(uri, 1, () => fs.writeFile(path.join(root, 'tsconfig.json'), '{"extends":"../external/base.json"}'));
	await expectDiagnostics(uri, 0, () => fs.writeFile(inherited, '{"vueCompilerOptions":{"plugins":[]}}'));
	assert.equal(own(vscode.Uri.file(path.join(root, 'App.vue'))).length, 0);
	const vue = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, 'App.vue')));
	await vscode.window.showTextDocument(vue);
	const messageSource = '<template>{outside}</template>\n<locale locale="en" lang="yaml">title: "{name} | @:target"</locale>';

	async function replaceVue(text) {
		const edit = new vscode.WorkspaceEdit();
		edit.replace(vue.uri, new vscode.Range(vue.positionAt(0), vue.positionAt(vue.getText().length)), text);
		assert.equal(await vscode.workspace.applyEdit(edit), true);
	}

	await replaceVue(messageSource);
	assert.deepEqual(api.getHighlights(vue.uri).map(span => vue.getText().slice(span.start, span.end)), ['{name}', '|', '@:target']);
	await vscode.workspace.getConfiguration('vvi', vue.uri).update('messageHighlighting', false, vscode.ConfigurationTarget.Workspace);
	assert.deepEqual(api.getHighlights(vue.uri), [], 'Disabling highlighting must clear decorations.');
	await vscode.workspace.getConfiguration('vvi', vue.uri).update('messageHighlighting', true, vscode.ConfigurationTarget.Workspace);
	assert.equal(api.getHighlights(vue.uri).length, 3);
	await replaceVue('<template>Locale removed</template>');
	assert.deepEqual(api.getHighlights(vue.uri), [], 'Removing the locale block must clear existing decorations.');
	await replaceVue(messageSource);
	// Keep a clean config document open while changing it externally: its editor
	// buffer may lag disk, and watcher events may invalidate an in-flight scan.
	await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, 'tsconfig.json')));
	for (const messageSyntax of ['icu', 'vue', 'icu', 'vue', 'icu']) {
		await fs.writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ vueCompilerOptions: { plugins: [{ name: 'vite-vue-internationalization/volar', messageSyntax }] } }));
		await api.refresh();
		assert.equal(api.getHighlights(vue.uri).length, messageSyntax === 'icu' ? 0 : 3, `${messageSyntax} project decorations must be current when refresh resolves.`);
	}
};
