import { parse } from '@vue/compiler-sfc';
import YAML, { isMap, isScalar, isSeq } from 'yaml';
import { getVueMessageSyntaxRanges } from './message.js';

export type MessageHighlight = { start: number; end: number; kind: 'named' | 'list' | 'literal' | 'linked' | 'plural' };

/** Highlight only scalar values inside locale custom blocks, never keys or comments. */
export function getLocaleMessageHighlights(source: string, filename: string): MessageHighlight[] {
	const spans: MessageHighlight[] = [];
	const { descriptor } = parse(source, { filename });
	for (const block of descriptor.customBlocks) {
		if (block.type !== 'locale' || !['yaml', 'yml', 'json'].includes(String(block.lang ?? 'yaml').toLowerCase())) continue;
		const document = YAML.parseDocument(block.content, { keepSourceTokens: true });
		const visit = (node: unknown) => {
			if (isMap(node)) { for (const pair of node.items) visit(pair.value); } else if (isSeq(node)) { for (const item of node.items) visit(item); } else if (isScalar(node) && typeof node.value === 'string' && node.range && node.srcToken) {
				const token = node.srcToken;
				if (!('source' in token) || typeof token.source !== 'string') return;
				const blockScalar = token.type === 'block-scalar';
				const offset = block.loc.start.offset + (blockScalar ? node.range[1] - token.source.length : token.offset);
				const mapped = decodeScalar(token.source, node.type);
				for (const span of getVueMessageSyntaxRanges(mapped.text)) {
					const start = mapped.starts[span.start];
					const end = mapped.ends[span.end - 1];
					spans.push({ start: offset + start, end: offset + end, kind: span.kind });
				}
			}
		};
		visit(document.contents);
	}
	return spans;
}

// Preserve offsets while decoding quoted scalar escapes. Newline folding only
// changes whitespace, which the single-line message tokens do not depend on.
function decodeScalar(source: string, type: string | undefined) {
	let text = '';
	const starts: number[] = [];
	const ends: number[] = [];
	const quoted = type === 'QUOTE_DOUBLE' || type === 'QUOTE_SINGLE';
	const limit = source.length - (quoted ? 1 : 0);
	for (let index = quoted ? 1 : 0; index < limit;) {
		const start = index;
		let value = source[index++];
		if (type === 'QUOTE_SINGLE' && value === '\'' && source[index] === '\'') index++;
		else if (type === 'QUOTE_DOUBLE' && value === '\\') {
			const escaped = source.charAt(index++);
			const width = escaped === 'x' ? 2 : escaped === 'u' ? 4 : escaped === 'U' ? 8 : 0;
			if (width && /^[\dA-Fa-f]+$/.test(source.slice(index, index + width)) && index + width <= limit) {
				const code = Number.parseInt(source.slice(index, index + width), 16);
				value = code <= 0x10ffff ? String.fromCodePoint(code) : '\uFFFD';
				index += width;
			} else {
				const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '0': '\0', a: '\x07', v: '\v', e: '\x1b', N: '\x85', _: '\xa0', L: '\u2028', P: '\u2029' };
				value = escapes[escaped] ?? escaped;
			}
		}
		text += value;
		for (let unit = 0; unit < value.length; unit++) { starts.push(start); ends.push(index); }
	}
	return { text, starts, ends };
}
