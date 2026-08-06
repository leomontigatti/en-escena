/**
 * THROWAWAY PROTOTYPE — variant switcher for ticket #623.
 *
 * Rendered inside `DialogContent` on purpose: the dialog traps focus, so a bar
 * mounted outside it would be unclickable.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";

import {
  prototypeCaseKeys,
  prototypeCases,
  type PrototypeCaseKey,
} from "./fixtures";

export const prototypeVariantKeys = ["A", "B", "C"] as const;
export type PrototypeVariantKey = (typeof prototypeVariantKeys)[number];

export const prototypeVariantNames: Record<PrototypeVariantKey, string> = {
  A: "Estado del evento",
  B: "Aviso sobre el elenco",
  C: "Resolución",
};

export function usePrototypeSelection() {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawVariant = searchParams.get("variant") ?? "A";
  const variant = (
    prototypeVariantKeys.includes(rawVariant as PrototypeVariantKey)
      ? rawVariant
      : "A"
  ) as PrototypeVariantKey;

  const rawCase = searchParams.get("caso") ?? "unico";
  const caseKey = (
    prototypeCaseKeys.includes(rawCase as PrototypeCaseKey) ? rawCase : "unico"
  ) as PrototypeCaseKey;

  function select(next: { variant?: PrototypeVariantKey; caso?: string }) {
    const params = new URLSearchParams(searchParams);
    if (next.variant) params.set("variant", next.variant);
    if (next.caso) params.set("caso", next.caso);
    setSearchParams(params, { replace: true, preventScrollReset: true });
  }

  return { variant, caseKey, select };
}

export function PrototypeSwitcher({
  variant,
  caseKey,
  onSelect,
}: {
  variant: PrototypeVariantKey;
  caseKey: PrototypeCaseKey;
  onSelect: (next: { variant?: PrototypeVariantKey; caso?: string }) => void;
}) {
  function cycleVariant(delta: number) {
    const index = prototypeVariantKeys.indexOf(variant);
    const nextIndex =
      (index + delta + prototypeVariantKeys.length) %
      prototypeVariantKeys.length;
    onSelect({ variant: prototypeVariantKeys[nextIndex] });
  }

  function cycleCase(delta: number) {
    const index = prototypeCaseKeys.indexOf(caseKey);
    const nextIndex =
      (index + delta + prototypeCaseKeys.length) % prototypeCaseKeys.length;
    onSelect({ caso: prototypeCaseKeys[nextIndex] });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (event.key === "ArrowLeft") cycleVariant(-1);
      if (event.key === "ArrowRight") cycleVariant(1);
      if (event.key === "ArrowUp") cycleCase(-1);
      if (event.key === "ArrowDown") cycleCase(1);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    // `fixed` would resolve against `DialogContent`, which Radix transforms to
    // centre — so the bar is anchored under the dialog card instead.
    <div className="absolute top-full left-1/2 z-50 mt-4 flex w-max -translate-x-1/2 flex-col items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-lg">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Variante anterior"
          onClick={() => cycleVariant(-1)}
        >
          <ChevronLeft aria-hidden="true" data-icon />
        </Button>
        <span className="min-w-56 text-center text-sm font-medium">
          {variant} — {prototypeVariantNames[variant]}
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Variante siguiente"
          onClick={() => cycleVariant(1)}
        >
          <ChevronRight aria-hidden="true" data-icon />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Caso anterior"
          onClick={() => cycleCase(-1)}
        >
          <ChevronLeft aria-hidden="true" data-icon />
        </Button>
        <span className="min-w-56 text-center text-xs text-muted-foreground">
          {prototypeCases[caseKey].label}
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Caso siguiente"
          onClick={() => cycleCase(1)}
        >
          <ChevronRight aria-hidden="true" data-icon />
        </Button>
      </div>

      <p className="max-w-96 text-center text-xs text-muted-foreground">
        {prototypeCases[caseKey].description}
      </p>

      <p className="text-center text-xs text-muted-foreground">
        ← → variante · ↑ ↓ caso
      </p>
    </div>
  );
}
