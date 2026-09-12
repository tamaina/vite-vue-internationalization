import { describe, expect, it } from 'vitest';
import { BoundedCache } from '../src/boundedCache.js';
import { volarInternals as v } from '../src/volar.js';

describe('Volar cache retention', () => {
	it('replaces per-file revisions and reuses parsing before bounded type eviction', () => {
		const cache = v.createVolarCache();
		for (let revision = 0; revision < 1000; revision++) {
			const content = `<locale locale="en">title: Revision ${revision}</locale>`;
			const blocks = [{ name: 'locale_0', type: 'locale', attrs: { locale: 'en' }, lang: 'yaml', content: `title: Revision ${revision}` }];
			const dictionary = v.getLocaleDictionary(cache, content, '/App.vue', blocks, 'en');
			expect(v.getLocaleDictionary(cache, content, '/App.vue', blocks, 'en')).toBe(dictionary);
			expect(dictionary.title).toBe(`Revision ${revision}`);
			v.getGeneratedTypes(cache, {}, undefined, dictionary);
			v.getLocaleDiagnostics(cache, blocks, 'en', dictionary, '/App.vue');
		}
		expect(cache.stats.scriptParses).toBe(1000);
		expect(cache.moduleDictionaries.size).toBe(1);
		expect(cache.moduleDiagnostics.size).toBe(1);
		expect(cache.generatedTypes.size).toBe(256);
		const early = v.getGeneratedTypes(cache, {}, undefined, { title: 'Revision 0' });
		expect(early.localeRefType).toContain('Revision 0');
		expect(cache.generatedTypes.size).toBe(256);
	});
	it('evicts the least recently used entry and supports explicit release', () => {
		const cache = new BoundedCache<string, number>(2);
		cache.set('a', 1).set('b', 2);
		expect(cache.get('a')).toBe(1);
		cache.set('c', 3);
		expect([...cache.keys()]).toEqual(['a', 'c']);
		cache.delete('a');
		cache.clear();
		expect(cache.size).toBe(0);
	});
});
