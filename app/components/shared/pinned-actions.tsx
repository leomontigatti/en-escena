import type { ReactNode } from "react";

/**
 * A form's `Volver` and `Guardar`, pinned to the bottom of the viewport while
 * the page scrolls and resting on the bottom edge when it does not. It needs a
 * full-height column above it —both shells' `main` is one— and sits outside
 * any `Card`, whose overflow would clip it. The negative margin reaches the
 * edges of `main`'s padding, so the content scrolls under an opaque band.
 */
export function PinnedActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 -mb-6 mt-auto flex items-center justify-between gap-3 bg-background px-4 py-3">
      {children}
    </div>
  );
}
