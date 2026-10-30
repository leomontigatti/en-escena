/**
 * A polled page's data as the browser last had it, for a route's
 * `clientLoader`: a reload that fails answers with it instead of trading the
 * whole page for the error boundary. A venue's wifi or a deploy's restart
 * fails some polls; the next one tries again, and the page only goes one poll
 * stale. A first load, with nothing on screen to keep, still reports its
 * error.
 */
export function createKeptLoaderData<T>() {
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
