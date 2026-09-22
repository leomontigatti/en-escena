// PROTOTYPE — throwaway, never merge. The floating bar that flips a prototype
// route between its variants through `?variant=`.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";

const prototypeVariantParamName = "variant";

export type PrototypeVariant = { key: string; name: string };

export function usePrototypeVariant(variants: PrototypeVariant[]) {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get(prototypeVariantParamName);

  return (variants.find((variant) => variant.key === requested) ?? variants[0])
    .key;
}

export function PrototypeSwitcher({
  children,
  current,
  variants,
}: {
  /** Prototype-only controls and state readouts, shown beside the label. */
  children?: ReactNode;
  current: string;
  variants: PrototypeVariant[];
}) {
  const [, setSearchParams] = useSearchParams();
  const currentIndex = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  function go(step: number) {
    const next =
      variants[(currentIndex + step + variants.length) % variants.length];
    // Only the variant survives the switch: whatever a variant keeps in the
    // URL means nothing to the others.
    setSearchParams({ [prototypeVariantParamName]: next.key });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, [contenteditable], [role=dialog]") ||
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      ) {
        return;
      }
      go(event.key === "ArrowLeft" ? -1 : 1);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (import.meta.env.PROD) {
    return null;
  }

  const variant = variants[currentIndex];

  return (
    <div className="dark fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-background px-2 py-1.5 text-foreground shadow-lg">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Variante anterior"
        onClick={() => go(-1)}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span className="text-sm font-medium whitespace-nowrap">
        {variant.key} ({variant.name})
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Variante siguiente"
        onClick={() => go(1)}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
      {children}
    </div>
  );
}
