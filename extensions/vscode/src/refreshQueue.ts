/** Serializes refreshes and resolves callers only after the latest revision commits. */
export function createRefreshQueue(prepare: () => Promise<() => void>) {
	let revision = 0;
	let applied = -1;
	let disposed = false;
	let running: Promise<void> | undefined;
	return {
		invalidate() { revision++; },
		refresh(): Promise<void> {
			if (disposed) return Promise.resolve();
			revision++;
			if (running) return running;
			running = (async () => {
				try {
					while (!disposed && applied !== revision) {
						const token = revision;
						const commit = await prepare();
						if (disposed || token !== revision) continue;
						commit();
						applied = token;
					}
				} finally { running = undefined; }
			})();
			return running;
		},
		dispose() { disposed = true; revision++; },
	};
}
