/**
 * PROTOTIPO DESCARTABLE — barra flotante para alternar variantes de una pantalla
 * en prototipos de UI (skill `/prototype`). No es parte del sistema visual: se
 * ve deliberadamente ajena a la pantalla que se está evaluando y no se renderiza
 * en producción.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";

type PrototypeVariant = {
  key: string;
  name: string;
};

type PrototypeSwitcherProps = {
  variants: PrototypeVariant[];
  current: string;
  searchParamName?: string;
};

export function PrototypeSwitcher({
  variants,
  current,
  searchParamName = "variant",
}: PrototypeSwitcherProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentIndex = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  function goTo(offset: number) {
    const next =
      variants[(currentIndex + offset + variants.length) % variants.length];
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(searchParamName, next.key);
    setSearchParams(nextParams, { replace: true, preventScrollReset: true });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }

      goTo(event.key === "ArrowLeft" ? -1 : 1);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (import.meta.env.PROD) {
    return null;
  }

  const variant = variants[currentIndex];

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-foreground bg-foreground p-1 text-background shadow-lg">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Variante anterior"
        className="rounded-full text-background hover:bg-background/20 hover:text-background"
        onClick={() => goTo(-1)}
      >
        <ChevronLeft />
      </Button>
      <span className="px-2 text-xs font-medium tabular-nums">
        {variant.key} — {variant.name}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Variante siguiente"
        className="rounded-full text-background hover:bg-background/20 hover:text-background"
        onClick={() => goTo(1)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
