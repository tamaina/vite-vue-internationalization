import type { Code } from '@vue/language-core';

export function insertAfter(content: Code[], marker: string, insertion: string): boolean {
	return replaceFirstGeneratedOnly(content, marker, `${marker}${insertion}`);
}

export function replaceFirstGeneratedOnly(content: Code[], search: string, replacement: string): boolean {
	let runStart = 0;

	while (runStart < content.length) {
		while (runStart < content.length && typeof content[runStart] !== 'string') {
			runStart++;
		}

		let runEnd = runStart;

		while (runEnd < content.length && typeof content[runEnd] === 'string') {
			runEnd++;
		}

		if (runStart === runEnd) {
			continue;
		}

		const text = content.slice(runStart, runEnd).join('');
		const start = text.indexOf(search);

		if (start >= 0) {
			content.splice(
				runStart,
				runEnd - runStart,
				text.slice(0, start),
				replacement,
				text.slice(start + search.length),
			);
			return true;
		}

		runStart = runEnd + 1;
	}
	return false;
}
