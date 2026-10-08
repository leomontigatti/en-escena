// PROTOTYPE — throwaway, do not merge
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";

export type PrototypeVariant = { key: string; name: string };

/**
 * Floating bar that cycles `?variant=` (arrows or ← →). It sits at the top of
 * the screen, not the bottom, because every vote variant puts its own sticky
 * vote bar at the bottom and the switcher would cover the thing being judged.
 * Never rendered in a production build.
 */
export function PrototypeVoteSwitcher({
  variants,
  current,
}: {
  variants: PrototypeVariant[];
  current: string;
}) {
  const [, setSearchParams] = useSearchParams();
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const go = useCallback(
    (step: number) => {
      const next = variants[(index + step + variants.length) % variants.length];
      if (!next) return;
      setSearchParams(
        (params) => {
          params.set("variant", next.key);
          params.delete("estado");
          params.delete("academia");
          return params;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [index, setSearchParams, variants],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest("input, textarea, select, [contenteditable]") ??
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [go]);

  if (import.meta.env.PROD) return null;

  const currentVariant = variants[index];

  return (
    <div className="fixed top-2 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-foreground p-1 text-background shadow-lg">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Variante anterior"
        onClick={() => go(-1)}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span className="px-2 text-xs font-medium whitespace-nowrap">
        {currentVariant?.key} ({currentVariant?.name})
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Variante siguiente"
        onClick={() => go(1)}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}
