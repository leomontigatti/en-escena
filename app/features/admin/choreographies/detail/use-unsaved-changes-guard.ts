import { useEffect } from "react";
import { useBlocker } from "react-router";

import type { DiscardChangesDialogProps } from "@/components/shared/discard-guard";

/**
 * Asks before the draft is left behind: through `Volver`, the sidebar, the
 * breadcrumbs, the browser's back or a closing tab. The save's own submission
 * stays on the page, so it is never asked about.
 */
export function useUnsavedChangesGuard(input: {
  isDirty: boolean;
  isSaving: boolean;
}): DiscardChangesDialogProps {
  const shouldAsk = input.isDirty && !input.isSaving;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      shouldAsk &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );

  useEffect(() => {
    if (!shouldAsk) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [shouldAsk]);

  return {
    onDiscard: () => blocker.proceed?.(),
    onKeepEditing: () => blocker.reset?.(),
    open: blocker.state === "blocked",
  };
}
