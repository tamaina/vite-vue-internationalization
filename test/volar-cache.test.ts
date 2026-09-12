import { describe, expect, it } from 'vitest';
import { BoundedCache } from '../src/boundedCache.js';
import { volarInternals as v } from '../src/volar.js';

describe('Volar cache retention', () => {
	it('distinguishes the implicit custom-block txt language from explicit unsupported txt', () => {
		const cache = v.createVolarCache();
		const block = { name: 'locale_0', type: 'locale', attrs: { locale: 'en' }, lang: 'txt', content: 'title: default YAML' };
		const dictionary = v.getLocaleDictionary(cache, '', '/App.vue', [block], 'en');
		expect(dictionary.title).toBe('default YAML');
		expect(v.getLocaleDiagnostics(cache, [block], 'en', dictionary, '/App.vue')).toHaveLength(0);
		const explicit = { ...block, attrs: { ...block.attrs, lang: 'txt' } };
		expect(v.getLocaleDiagnostics(cache, [explicit], 'en', {}, '/App.vue')[0].message).toContain('Unsupported locale lang "txt"');
	});
	it('owns file data by IR and isolates new projects while sharing bounded type data', () => {
		const project = v.createVolarProjectCache();
		const owner = {};
		const first = project.forFile(owner);
		expect(project.forFile(owner)).toBe(first);
		const other = project.forFile({});
		expect(other.moduleDictionaries).not.toBe(first.moduleDictionaries);
		expect(other.generatedTypes).toBe(first.generatedTypes);
		expect(v.createVolarProjectCache().shared.generatedTypes).not.toBe(first.generatedTypes);
	});
	it('invalidates locale selection and linked diagnostics when their inputs change', () => {
		const cache = v.createVolarCache();
		const blocks = ['en', 'ja'].map(locale => ({ name: `locale_${locale}`, type: 'locale', attrs: { locale }, lang: 'yaml', content: `title: ${locale}\nlinked: "@:target"` }));
		expect(v.getLocaleDictionary(cache, '', '/App.vue', blocks, 'en').title).toBe('en');
		expect(v.getLocaleDictionary(cache, '', '/App.vue', blocks, 'ja').title).toBe('ja');
		expect(v.getLocaleDiagnostics(cache, blocks, 'en', {}, '/App.vue')).toHaveLength(1);
		expect(v.getLocaleDiagnostics(cache, blocks, 'en', { target: 'resolved' }, '/App.vue')).toHaveLength(0);
	});
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
