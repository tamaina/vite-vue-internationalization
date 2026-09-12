import { describe, expect, it } from 'vitest';
import { getLocaleMessageHighlights } from '../src/editorHighlighting.js';

const highlighted = (source: string) => getLocaleMessageHighlights(source, 'Fixture.vue').map(span => ({ kind: span.kind, text: source.slice(span.start, span.end) }));

describe('locale-only message highlighting', () => {
	it('highlights all Vue message token kinds in YAML values and excludes other SFC content', () => {
		const source = `<template>{{ '{outside}' }}</template>
<script setup>const value = '{script}';</script>
<other lang="yaml">text: "{other}"</other>
<locale locale="en" lang="yaml">
"{key}": "Hello {name} {user-name} {0} {'@'} | @:target @.lower:target @.upper:target @.capitalize:target"
# {comment}
plain: Welcome {plain}
</locale>`;
		expect(highlighted(source)).toEqual([
			{ kind: 'named', text: '{name}' }, { kind: 'named', text: '{user-name}' },
			{ kind: 'list', text: '{0}' }, { kind: 'literal', text: '{\'@\'}' }, { kind: 'plural', text: '|' },
			{ kind: 'linked', text: '@:target' }, { kind: 'linked', text: '@.lower:target' },
			{ kind: 'linked', text: '@.upper:target' }, { kind: 'linked', text: '@.capitalize:target' },
			{ kind: 'named', text: '{plain}' },
		]);
	});
	it('keeps source positions through JSON escapes, YAML single quotes and astral text', () => {
		const source = `<locale locale="en" lang="json">${JSON.stringify({ title: '😀 {"@"} {1}' })}</locale>
<locale locale="ja" lang="yml">title: '😀 {''@''} {name}'</locale>`;
		expect(highlighted(source)).toEqual([
			{ kind: 'literal', text: '{\\"@\\"}' }, { kind: 'list', text: '{1}' },
			{ kind: 'literal', text: '{\'\'@\'\'}' }, { kind: 'named', text: '{name}' },
		]);
	});
	it('does not treat a YAML block header or literal pipe as a plural separator', () => {
		const source = `<locale locale="en">
title: |
  Hello {name}
  {'|'} | @:other
folded: >
  Welcome {user}
</locale>`;
		expect(highlighted(source)).toEqual([
			{ kind: 'named', text: '{name}' }, { kind: 'literal', text: '{\'|\'}' },
			{ kind: 'plural', text: '|' }, { kind: 'linked', text: '@:other' },
			{ kind: 'named', text: '{user}' },
		]);
	});
	it('skips unsupported blocks and recovers when an edited locale block is removed', () => {
		expect(highlighted('<locale lang="txt">{name}</locale>')).toEqual([]);
		expect(highlighted('<template>Removed</template>')).toEqual([]);
		expect(() => highlighted('<locale lang="yaml">title: "{name}</locale>')).not.toThrow();
	});
	it('maps Unicode escape syntax back to its original source bytes', () => {
		const source = String.raw`<locale locale="en" lang="json">{"title":"\u007bname\u007d"}</locale>`;
		expect(highlighted(source)).toEqual([{ kind: 'named', text: String.raw`\u007bname\u007d` }]);
	});
});
