import { describe, expect, it } from 'vitest';
import { createRefreshQueue } from '../extensions/vscode/src/refreshQueue.js';

function barrier() {
	let resolve!: () => void;
	const promise = new Promise<void>(done => { resolve = done; });
	return { promise, resolve };
}

describe('editor refresh completion', () => {
	it('retries an invalidated scan before resolving concurrent refresh callers', async () => {
		const first = barrier();
		const second = barrier();
		const entered = barrier();
		const committed: number[] = [];
		let scans = 0;
		const queue = createRefreshQueue(async () => {
			const scan = ++scans;
			if (scan === 1) await first.promise;
			else { entered.resolve(); await second.promise; }
			return () => { committed.push(scan); };
		});
		let finished = false;
		const refresh = queue.refresh().then(() => { finished = true; });
		queue.invalidate(); // A watcher event arrives while findFiles is pending.
		const concurrent = queue.refresh();
		first.resolve();
		await entered.promise;
		expect(finished).toBe(false);
		expect(committed).toEqual([]);
		second.resolve();
		await Promise.all([refresh, concurrent]);
		expect(committed).toEqual([2]);
		expect(scans).toBe(2);
	});
	it('can refresh again after failure and does not commit after disposal', async () => {
		const gate = barrier();
		let scans = 0;
		let commits = 0;
		const queue = createRefreshQueue(async () => {
			if (++scans === 1) throw new Error('scan failed');
			await gate.promise;
			return () => { commits++; };
		});
		await expect(queue.refresh()).rejects.toThrow('scan failed');
		const retried = queue.refresh();
		queue.dispose();
		gate.resolve();
		await retried;
		expect(scans).toBe(2);
		expect(commits).toBe(0);
	});
});
