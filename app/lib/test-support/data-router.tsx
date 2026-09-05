import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";

/**
 * Wraps a route view in a data router, which is what the running app always
 * gives it. `MemoryRouter` is not one, and hooks that read the data router —
 * `useViewTransitionState`, for one — throw under it.
 *
 * The entry may carry a search string; the route is matched on its path.
 */
export function renderInDataRouter(entry: string, element: ReactElement) {
  const [path] = entry.split("?");
  const router = createMemoryRouter(
    [
      {
        path,
        action: async () => null,
        element,
      },
    ],
    { initialEntries: [entry] },
  );

  return <RouterProvider router={router} />;
}
