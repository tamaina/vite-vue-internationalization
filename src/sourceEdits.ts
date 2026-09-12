import { SourceMap as InputSourceMap } from 'node:module';
import { SourceMap } from 'magic-string';
import type { SourceMapPayload } from 'node:module';
import type { SourceMapSegment } from 'magic-string';

/** An explicitly retained range of the current source, including its provenance. */
export type SourceSlice = { start: number; end: number };
type Replacement = string | Array<string | SourceSlice | SourceEdits>;

/** Composes concrete edit positions; it never guesses provenance from text diffs. */
export class SourceEdits {
	code: string;
	private origins: Array<number | undefined>;

	constructor(readonly original: string, readonly filename: string, snapshot?: { code: string; origins: Array<number | undefined> }) {
		this.code = snapshot?.code ?? original;
		this.origins = snapshot?.origins ?? Array.from({ length: original.length }, (_, index) => index);
	}

	fork(start: number, end: number): SourceEdits {
		return new SourceEdits(this.original, this.filename, { code: this.code.slice(start, end), origins: this.origins.slice(start, end) });
	}

	replace(code: string, start: number, end: number, replacement: Replacement): string {
		if (code !== this.code) throw new Error('Source edit order does not match the tracked source.');
		const pieces = typeof replacement === 'string' ? [replacement] : replacement;
		const text = pieces.map(piece => typeof piece === 'string' ? piece : piece instanceof SourceEdits ? piece.code : code.slice(piece.start, piece.end)).join('');
		const origins = pieces.flatMap(piece => typeof piece === 'string'
			? Array.from<number | undefined>({ length: piece.length }).fill(start < end ? this.origins[start] : undefined)
			: piece instanceof SourceEdits ? piece.origins : this.origins.slice(piece.start, piece.end));
		this.code = code.slice(0, start) + text + code.slice(end);
		this.origins = this.origins.slice(0, start).concat(origins, this.origins.slice(end));
		return this.code;
	}

	generateMap(upstream?: SourceMapPayload, outputFile = this.filename): SourceMap {
		const inputMap = upstream ? new InputSourceMap(upstream) : undefined;
		const sources = upstream ? [...upstream.sources] : [this.filename];
		const lines: number[] = [];
		const columns: number[] = [];
		let line = 0;
		let column = 0;
		for (let index = 0; index < this.original.length; index++) {
			lines.push(line);
			columns.push(column);
			if (this.original[index] === '\n') { line++; column = 0; } else column++;
		}
		const mappings: SourceMapSegment[][] = [[]];
		line = 0;
		column = 0;
		let previous: number | undefined;
		for (let index = 0; index < this.code.length; index++) {
			const origin = this.origins[index];
			if (column === 0 || origin !== previous) {
				if (origin === undefined) mappings[line].push([column]);
				else if (inputMap) {
					const entry = inputMap.findEntry(lines[origin], columns[origin]);
					if ('originalSource' in entry) {
						let source = sources.indexOf(entry.originalSource);
						if (source < 0) { source = sources.length; sources.push(entry.originalSource); }
						mappings[line].push([column, source, entry.originalLine, entry.originalColumn]);
					} else mappings[line].push([column]);
				} else mappings[line].push([column, 0, lines[origin], columns[origin]]);
			}
			previous = origin;
			if (this.code[index] === '\n') { line++; column = 0; mappings.push([]); } else column++;
		}
		const map = new SourceMap({ file: outputFile, sources, sourcesContent: upstream?.sourcesContent ? [...upstream.sourcesContent] : [this.original], names: [], mappings });
		if (upstream?.sourceRoot) Object.assign(map, { sourceRoot: upstream.sourceRoot });
		return map;
	}
}

export function editSource(code: string, start: number, end: number, replacement: Replacement, edits?: SourceEdits): string {
	if (edits) return edits.replace(code, start, end, replacement);
	const pieces = typeof replacement === 'string' ? [replacement] : replacement;
	return code.slice(0, start) + pieces.map(piece => typeof piece === 'string' ? piece : piece instanceof SourceEdits ? piece.code : code.slice(piece.start, piece.end)).join('') + code.slice(end);
}

export function editSourceRange(code: string, start: number, end: number, transform: (source: string, edits?: SourceEdits) => string, edits?: SourceEdits): string {
	const child = edits?.fork(start, end);
	const transformed = transform(code.slice(start, end), child);
	if (child && child.code !== transformed) throw new Error('A source transformation did not record all edits.');
	return editSource(code, start, end, child ? [child] : transformed, edits);
}
