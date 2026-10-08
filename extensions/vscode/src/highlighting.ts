import * as vscode from 'vscode';
import { getLocaleMessageHighlights, type MessageHighlight } from '../../../src/editorHighlighting.js';

export function registerMessageHighlighting(context: vscode.ExtensionContext, isVueSyntax: (file: string) => boolean) {
	const kinds = ['named', 'list', 'literal', 'linked', 'plural'] as const;
	const decorations = new Map(kinds.map(kind => [kind, vscode.window.createTextEditorDecorationType({ color: new vscode.ThemeColor(`vvi.message.${kind}`) })]));
	const visible = new Map<string, MessageHighlight[]>();
	const update = () => {
		visible.clear();
		for (const editor of vscode.window.visibleTextEditors) {
			const document = editor.document;
			if (document.languageId !== 'vue' && !document.fileName.endsWith('.vue')) continue;
			const enabled = vscode.workspace.getConfiguration('vvi', document.uri).get<boolean>('messageHighlighting', true);
			let spans: MessageHighlight[] = [];
			if (enabled && isVueSyntax(document.fileName)) {
				try { spans = getLocaleMessageHighlights(document.getText(), document.fileName); } catch { /* Incomplete edits are retried on the next change. */ }
			}
			for (const [kind, decoration] of decorations) editor.setDecorations(decoration, spans.filter(span => span.kind === kind).map(span => new vscode.Range(document.positionAt(span.start), document.positionAt(span.end))));
			visible.set(document.uri.toString(), spans);
		}
	};
	context.subscriptions.push(...decorations.values(), vscode.window.onDidChangeVisibleTextEditors(update),
		vscode.workspace.onDidChangeTextDocument(update), vscode.workspace.onDidChangeConfiguration(update),
		{ dispose: () => visible.clear() });
	update();
	return { update, getHighlights: (uri: vscode.Uri) => visible.get(uri.toString()) ?? [] };
}
