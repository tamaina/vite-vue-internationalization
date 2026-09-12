import { describe, expect, it } from 'vitest';
import { internals } from '../src/plugin.js';

describe('locale hash structural identity', () => {
	it('distinguishes a message function from a dictionary mimicking its serialization marker', () => {
		const message = () => 'Message';
		const dictionary = { source: message.toString() };
		// This pair serialized identically with the former JSON function replacer.
		const former = (value: unknown) => JSON.stringify(value, (_key, child: unknown) => typeof child === 'function' ? { source: child.toString() } : child);
		expect(former(message)).toBe(former(dictionary));
		expect(internals.createLocaleHash({ en: { message } })).not.toBe(internals.createLocaleHash({ en: { message: dictionary } }));
	});
	it('is deterministic for reordered dictionary keys and distinguishes arrays from marker-shaped objects', () => {
		expect(internals.createLocaleHash({ en: { b: 2, a: 1 } })).toBe(internals.createLocaleHash({ en: { a: 1, b: 2 } }));
		expect(internals.createLocaleHash(['function', 'text'])).not.toBe(internals.createLocaleHash({ 0: 'function', 1: 'text' }));
	});
});
