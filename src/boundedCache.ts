/** Least-recently-used storage for recomputable editor data. */
export class BoundedCache<K, V> extends Map<K, V> {
	constructor(readonly capacity: number) {
		super();
		if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Cache capacity must be a positive integer.');
	}

	override get(key: K): V | undefined {
		const value = super.get(key);
		if (super.has(key)) {
			super.delete(key);
			super.set(key, value as V);
		}
		return value;
	}

	override set(key: K, value: V): this {
		super.delete(key);
		super.set(key, value);
		if (this.size > this.capacity) super.delete(this.keys().next().value as K);
		return this;
	}
}
