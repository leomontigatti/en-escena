/**
 * The audit page's totals, kept in this process for a few seconds. However
 * many auditors reload at once, the votes table is counted at most once per
 * key per time to live: reads that arrive while a count runs wait for that
 * one, however long it takes, and the time to live starts once it settles. A
 * failed count is dropped, so the next read tries again.
 *
 * In-process on purpose: the app is one process on one VPS, with no Redis
 * (PRD #198, "Load").
 */
export function createAuditTotalsCache<T>(deps: {
  now: () => number;
  read: (key: string) => Promise<T>;
  ttlMs: number;
}) {
  /** `expiresAt` is null while the count runs. */
  const entries = new Map<
    string,
    { expiresAt: number | null; value: Promise<T> }
  >();

  return {
    read(key: string): Promise<T> {
      const cached = entries.get(key);

      if (
        cached &&
        (cached.expiresAt === null || cached.expiresAt > deps.now())
      ) {
        return cached.value;
      }

      const value = deps.read(key);
      const entry = { expiresAt: null as number | null, value };
      entries.set(key, entry);
      void value.then(
        () => {
          entry.expiresAt = deps.now() + deps.ttlMs;
        },
        () => {
          // The caller gets the rejection; the cache only forgets it.
          if (entries.get(key) === entry) {
            entries.delete(key);
          }
        },
      );

      return value;
    },
  };
}
