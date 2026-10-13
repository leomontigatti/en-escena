// PROTOTYPE optional-level, wipe me. Variant switch for the ?prototipo=A|B|C param, mounted only when it is present.
import { useEffect } from "react";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";

export type PrototypeVariant = { key: string; name: string };

export const wizardPrototypeVariants: PrototypeVariant[] = [
  { key: "A", name: "Tarjeta Sin nivel" },
  { key: "B", name: "Tocar de nuevo para quitar" },
  { key: "C", name: "Casilla que apaga las tarjetas" },
];

const keys = ["A", "B", "C"];

/** The variant the URL asks for, or null: the page is unchanged without it. */
export function usePrototypeVariant(): string | null {
  const [params] = useSearchParams();
  // PROTOTYPE optional-level: never reachable in a production build.
  if (import.meta.env.PROD) return null;
  // Defaults to A in dev, so the wizard shows the prototype without the param.
  const value = params.get("prototipo")?.toUpperCase() ?? "A";
  return keys.includes(value) ? value : "A";
}

function step(current: string, delta: number) {
  const index = keys.indexOf(current);
  return keys[(index + delta + keys.length) % keys.length];
}

export function PrototypeSwitcher({
  current,
  variants,
}: {
  current: string;
  variants: PrototypeVariant[];
}) {
  const [, setSearchParams] = useSearchParams();
  const active = variants.find((item) => item.key === current) ?? variants[0];

  function go(key: string) {
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        params.set("prototipo", key);
        return params;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable]") ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      if (event.key === "ArrowRight") go(step(active.key, 1));
      if (event.key === "ArrowLeft") go(step(active.key, -1));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // `go` reads the URL through setSearchParams; re-binding per render is cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.key]);

  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Selector de variante del prototipo"
      className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      <div className="flex items-center gap-2 rounded-full border-2 border-foreground bg-background px-3 py-2 shadow-xl">
        <span className="rounded-full bg-amber-300 px-2 py-0.5 text-xs font-bold text-black">
          PROTOTIPO
        </span>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Variante anterior"
          onClick={() => go(step(active.key, -1))}
        >
          ←
        </Button>
        <span className="min-w-56 text-center text-sm font-medium whitespace-nowrap">
          {active.key} · {active.name}
        </span>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Variante siguiente"
          onClick={() => go(step(active.key, 1))}
        >
          →
        </Button>
      </div>
    </div>
  );
}
