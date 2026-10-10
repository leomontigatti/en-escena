/**
 * The program the browser last had, so a reload that fails keeps it on screen
 * instead of trading the whole page for the error boundary. The live day's
 * tab reloads every minute, and a venue's wifi or a deploy's restart fails some
 * of those: the next minute tries again, and the program only goes a minute
 * stale. A first load, with nothing on screen to keep, still reports its error.
 */
export function createKeptProgram<T>() {
  let kept: { data: T } | null = null;

  return {
    remember(data: T) {
      kept = { data };
    },
    async reload(serverLoader: () => Promise<T>): Promise<T> {
      try {
        const data = await serverLoader();
        kept = { data };

        return data;
      } catch (error) {
        if (kept) {
          return kept.data;
        }

        throw error;
      }
    },
  };
}
