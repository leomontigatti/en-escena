// PROTOTIPO — descartable. Ver issue #488.
//
// Barra flotante para alternar entre variantes de UI vía `?variant=`.
// Se oculta en producción para que un merge accidental no la muestre.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";

export type PrototypeVariant = {
  key: string;
  name: string;
};

export function usePrototypeVariant(variants: readonly PrototypeVariant[]) {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("variant")?.toUpperCase();

  return variants.some((variant) => variant.key === requested)
    ? (requested as string)
    : variants[0].key;
}

export function PrototypeVariantSwitcher({
  current,
  variants,
}: {
  current: string;
  variants: readonly PrototypeVariant[];
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const index = variants.findIndex((variant) => variant.key === current);
  const active = variants[index] ?? variants[0];

  const go = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length];
    const params = new URLSearchParams(searchParams);
    params.set("variant", next.key);
    navigate({ search: `?${params.toString()}` }, { replace: true });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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

      go(event.key === "ArrowLeft" ? -1 : 1);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-primary bg-foreground px-2 py-1.5 text-background shadow-xl">
      <button
        type="button"
        aria-label="Variante anterior"
        className="rounded-full p-1.5 hover:bg-muted-foreground"
        onClick={() => go(-1)}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <span className="min-w-56 px-2 text-center font-mono text-xs tracking-tight">
        <span className="font-bold text-primary">{active.key}</span>
        {" — "}
        {active.name}
      </span>
      <button
        type="button"
        aria-label="Variante siguiente"
        className="rounded-full p-1.5 hover:bg-muted-foreground"
        onClick={() => go(1)}
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
