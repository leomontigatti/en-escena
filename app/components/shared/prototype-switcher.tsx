// PROTOTYPE — throwaway, do not merge
// Floating bar that cycles `?variant=` on the current route. Hidden in
// production builds (`import.meta.env.PROD` is Vite's NODE_ENV === "production").
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";

type PrototypeVariant = { key: string; name?: string };

function usePrototypeVariant(variants: PrototypeVariant[]) {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("variant");
  const fallback = variants[0]?.key ?? "A";

  return variants.some((variant) => variant.key === requested)
    ? (requested ?? fallback)
    : fallback;
}

function PrototypeSwitcher({ variants }: { variants: PrototypeVariant[] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const current = usePrototypeVariant(variants);
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const step = useCallback(
    (delta: number) => {
      const next =
        variants[(index + delta + variants.length) % variants.length];
      if (!next) return;
      const params = new URLSearchParams(searchParams);
      params.set("variant", next.key);
      setSearchParams(params, { replace: true, preventScrollReset: true });
    },
    [index, searchParams, setSearchParams, variants],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.closest("input, textarea, select, [contenteditable]") ||
          target.isContentEditable ||
          target.getAttribute("role") === "radio" ||
          target.getAttribute("role") === "combobox")
      ) {
        return;
      }
      step(event.key === "ArrowLeft" ? -1 : 1);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step]);

  if (import.meta.env.PROD || variants.length === 0) return null;

  const active = variants[index];

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-foreground px-2 py-1 text-background shadow-lg">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Variante anterior"
        onClick={() => step(-1)}
      >
        <ChevronLeft />
      </Button>
      <span className="min-w-48 text-center text-sm font-medium">
        {active?.key}
        {active?.name ? ` (${active.name})` : null}
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Variante siguiente"
        onClick={() => step(1)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

export { type PrototypeVariant, PrototypeSwitcher, usePrototypeVariant };
