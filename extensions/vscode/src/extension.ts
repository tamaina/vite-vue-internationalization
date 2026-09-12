import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, isAbsolute } from 'node:path';
import * as vscode from 'vscode';
import { collectEditorDiagnostics } from '../../../src/editorDiagnostics.js';
import { registerMessageHighlighting } from './highlighting.js';

export async function activate(context: vscode.ExtensionContext) {
	const collection = vscode.languages.createDiagnosticCollection('vvi');
	const output = vscode.window.createOutputChannel('VVI Dictionary Diagnostics');
	const watchers = new Map<string, vscode.FileSystemWatcher>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let generation = 0;
	let disposed = false;
	let icuRoots: string[] = [];
	const highlighting = registerMessageHighlighting(context, file => !icuRoots.some(root => {
		const path = relative(root, file);
		return !path.startsWith('..') && !isAbsolute(path);
	}));
	const schedule = () => {
		generation++;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => { void refreshSafely(); }, 60);
	};

	async function refreshSafely() {
		try { await refresh(); } catch (error) {
			output.appendLine(`Cannot refresh dictionary diagnostics: ${String(error)}`);
		}
	}

	async function refresh() {
		const token = ++generation;
		const configs = await vscode.workspace.findFiles('**/{tsconfig*,jsconfig}.json', '**/{node_modules,.git,dist}/**');
		const buffers = new Map(vscode.workspace.textDocuments.filter(document => document.uri.scheme === 'file').map(document => [resolve(document.uri.fsPath), document.getText()]));
		const read = (file: string) => buffers.get(resolve(file)) ?? readFileSync(file, 'utf8');
		const next = new Map<string, vscode.Diagnostic[]>();
		const roots = new Set<string>();
		const nextIcuRoots: string[] = [];
		for (const config of configs) {
			const result = collectEditorDiagnostics(config.fsPath, read);
			if (result.configured && result.messageSyntax === 'icu') nextIcuRoots.push(dirname(config.fsPath));
			for (const root of [...result.watchRoots, ...result.dependencies.map(dirname)]) roots.add(root);
			for (const diagnostic of result.diagnostics) {
				const file = diagnostic.fileName ?? config.fsPath;
				let document: vscode.TextDocument;
				try { document = await vscode.workspace.openTextDocument(vscode.Uri.file(file)); } catch { continue; }
				const range = new vscode.Range(document.positionAt(diagnostic.start), document.positionAt(diagnostic.end));
				const item = new vscode.Diagnostic(range, diagnostic.message, vscode.DiagnosticSeverity.Error);
				item.source = 'VVI';
				const entries = next.get(file) ?? [];
				if (!entries.some(entry => entry.message === item.message && entry.range.isEqual(item.range))) entries.push(item);
				next.set(file, entries);
			}
		}
		if (disposed || token !== generation) return;
		icuRoots = nextIcuRoots;
		highlighting.update();
		collection.clear();
		collection.set([...next].map(([file, diagnostics]) => [vscode.Uri.file(file), diagnostics]));
		for (const [root, watcher] of watchers) if (!roots.has(root)) { watcher.dispose(); watchers.delete(root); }
		for (const root of roots) if (!watchers.has(root)) {
			const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '**/*.{json,yaml,yml}'));
			watcher.onDidCreate(schedule); watcher.onDidChange(schedule); watcher.onDidDelete(schedule);
			watchers.set(root, watcher);
		}
	}

	const configs = vscode.workspace.createFileSystemWatcher('**/{tsconfig*,jsconfig}.json');
	configs.onDidCreate(schedule); configs.onDidChange(schedule); configs.onDidDelete(schedule);
	context.subscriptions.push(collection, output, configs, vscode.commands.registerCommand('vvi.refreshDiagnostics', refreshSafely),
		vscode.workspace.onDidChangeTextDocument(event => { if (/\.(json|ya?ml)$/.test(event.document.fileName)) schedule(); }),
		vscode.workspace.onDidSaveTextDocument(schedule), vscode.workspace.onDidCloseTextDocument(schedule), vscode.workspace.onDidChangeWorkspaceFolders(schedule),
		{ dispose() { disposed = true; generation++; if (timer) clearTimeout(timer); for (const watcher of watchers.values()) watcher.dispose(); } });
	await refreshSafely();
	return { refresh: refreshSafely, getHighlights: highlighting.getHighlights };
}
