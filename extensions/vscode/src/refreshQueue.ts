/** Serializes refreshes and resolves callers only after the latest revision commits. */
export function createRefreshQueue(prepare: () => Promise<() => void>) {
	let revision = 0;
	let applied = -1;
	const lifecycle = new AbortController();
	let running: Promise<void> | undefined;
	return {
		invalidate() { revision++; },
		refresh(): Promise<void> {
			if (lifecycle.signal.aborted) return Promise.resolve();
			revision++;
			if (running) return running;
			running = (async () => {
				try {
					while (!lifecycle.signal.aborted && applied !== revision) {
						const token = revision;
						const commit = await prepare();
						// dispose() also advances revision, so a cancelled scan cannot commit.
						if (token !== revision) continue;
						commit();
						applied = token;
					}
				} finally { running = undefined; }
			})();
			return running;
		},
		dispose() { lifecycle.abort(); revision++; },
	};
}
