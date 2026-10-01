import type { ReactNode } from "react";

import { CardFooter } from "@/components/ui/card";

/**
 * A form's `Volver` and `Guardar`, closing the card they act on. Sticky, so it
 * rests right after the fields while the card fits the viewport and sticks to
 * the bottom edge while the card runs past it. It must be the card's last
 * child, and the card must clip with `overflow-clip`: `overflow-hidden` makes
 * the card a scroll container, which stops a sticky child from sticking.
 * `AdminResourceFormCard`'s `footer` does both.
 */
export function PinnedActions({ children }: { children: ReactNode }) {
  return (
    // Opaque, where `CardFooter` is translucent: the fields scroll under it.
    <CardFooter className="sticky bottom-0 z-10 justify-between gap-3 bg-card">
      {children}
    </CardFooter>
  );
}
