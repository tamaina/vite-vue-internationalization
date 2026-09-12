import { describe, expect, it, vi } from 'vitest';
import { allCodeFeatures } from '@vue/language-core';
import { insertAfter, replaceFirstGeneratedOnly } from '../src/volarAdapter.js';
import volar from '../src/volar.js';
import type { Code } from '@vue/language-core';

describe('Vue Language Tools generated-code adapter', () => {
	it('reports an unsupported generated shape once without throwing from the language plugin', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const plugin = volar({ config: { sfcTransform: 'all' } } as never);
			if (Array.isArray(plugin) || !plugin.resolveEmbeddedCode) throw new Error('Expected the language plugin.');
			const ir: Parameters<typeof plugin.resolveEmbeddedCode>[1] = { content: '', customBlocks: [], comments: [], template: undefined, script: undefined, scriptSetup: undefined, styles: [] };
			for (let update = 0; update < 2; update++) plugin.resolveEmbeddedCode('/App.vue', ir, { id: 'script_ts', content: ['unrecognized upstream shape'] } as never);
			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn.mock.calls[0][0]).toContain('Incomplete type injection for /App.vue');
		} finally { warn.mockRestore(); }
	});
	it('reports insertion success across split generated segments', () => {
		const code: Code[] = ['before ', 'MARK', 'ER after'];
		expect(insertAfter(code, 'MARKER', ' inserted')).toBe(true);
		expect(code.join('')).toBe('before MARKER inserted after');
	});
	it('reports unmatched upstream shapes without modifying code', () => {
		const code: Code[] = ['upstream changed its generated declaration'];
		const before = [...code];
		expect(replaceFirstGeneratedOnly(code, 'old declaration', 'injection')).toBe(false);
		expect(code).toEqual(before);
	});
	it('never treats mapped user code as an adapter insertion point', () => {
		const mapped: Code = ['MARKER', 'scriptSetup', 0, allCodeFeatures];
		const code: Code[] = ['prefix ', mapped, ' suffix'];
		expect(replaceFirstGeneratedOnly(code, 'MARKER', 'injection')).toBe(false);
		expect(code[1]).toBe(mapped);
	});
});
