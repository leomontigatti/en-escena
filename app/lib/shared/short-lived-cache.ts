/**
 * A read that answers from memory for `ttlMs` after its last load finished, so
 * a burst of readers costs one load. Reads that arrive while a load runs share
 * it however long it takes, so a slow database is never asked twice at once,
 * and a failed load is not kept: the next read tries again.
 *
 * It lives in the process, which is enough while production is one app
 * process; a second one would only load twice as often.
 */
export function cacheFor<T>(
  ttlMs: number,
  load: () => Promise<T>,
  now: () => number = Date.now,
): () => Promise<T> {
  let cached: { loadedAt: number | null; value: Promise<T> } | null = null;

  return () => {
    if (
      cached &&
      (cached.loadedAt === null || now() - cached.loadedAt < ttlMs)
    ) {
      return cached.value;
    }

    const entry: { loadedAt: number | null; value: Promise<T> } = {
      loadedAt: null,
      value: load(),
    };
    cached = entry;
    entry.value.then(
      () => {
        entry.loadedAt = now();
      },
      () => {
        if (cached === entry) {
          cached = null;
        }
      },
    );

    return entry.value;
  };
}
