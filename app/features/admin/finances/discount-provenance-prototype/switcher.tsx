/**
 * THROWAWAY PROTOTYPE — ticket #585 of map #547.
 *
 * The floating bar: variant, audience, and the scenario buttons. The scenarios
 * are the point — a static screenshot cannot show a bill moving, so the bar
 * makes a sibling register or withdraw *while the roster is on screen*.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";

import {
  prototypeAudienceKeys,
  prototypeAudienceNames,
  prototypeVariantKeys,
  prototypeVariantNames,
  type PrototypeAudienceKey,
  type PrototypeVariantKey,
} from "./shared";

export function usePrototypeSelection() {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawVariant = searchParams.get("variant") ?? "A";
  const variant = (
    prototypeVariantKeys.includes(rawVariant as PrototypeVariantKey)
      ? rawVariant
      : "A"
  ) as PrototypeVariantKey;

  const rawAudience = searchParams.get("vista") ?? "admin";
  const audience = (
    prototypeAudienceKeys.includes(rawAudience as PrototypeAudienceKey)
      ? rawAudience
      : "admin"
  ) as PrototypeAudienceKey;

  function select(next: {
    variant?: PrototypeVariantKey;
    vista?: PrototypeAudienceKey;
  }) {
    const params = new URLSearchParams(searchParams);
    if (next.variant) params.set("variant", next.variant);
    if (next.vista) params.set("vista", next.vista);
    setSearchParams(params, { replace: true, preventScrollReset: true });
  }

  return { variant, audience, select };
}

export function PrototypeSwitcher({
  variant,
  audience,
  onSelect,
  scenarios,
}: {
  variant: PrototypeVariantKey;
  audience: PrototypeAudienceKey;
  onSelect: (next: {
    variant?: PrototypeVariantKey;
    vista?: PrototypeAudienceKey;
  }) => void;
  scenarios: { label: string; onRun: () => void }[];
}) {
  function cycleVariant(delta: number) {
    const index = prototypeVariantKeys.indexOf(variant);
    const nextIndex =
      (index + delta + prototypeVariantKeys.length) %
      prototypeVariantKeys.length;
    onSelect({ variant: prototypeVariantKeys[nextIndex] });
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
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-max max-w-[calc(100vw-2rem)] flex-col items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-lg">
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
        <span className="min-w-72 text-center text-sm font-medium">
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

      <div className="flex flex-wrap items-center justify-center gap-2">
        {prototypeAudienceKeys.map((key) => (
          <Button
            key={key}
            type="button"
            size="xs"
            variant={key === audience ? "default" : "outline"}
            onClick={() => onSelect({ vista: key })}
          >
            {prototypeAudienceNames[key]}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {scenarios.map((scenario) => (
          <Button
            key={scenario.label}
            type="button"
            size="xs"
            variant="secondary"
            onClick={scenario.onRun}
          >
            {scenario.label}
          </Button>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">← → variante</p>
    </div>
  );
}
