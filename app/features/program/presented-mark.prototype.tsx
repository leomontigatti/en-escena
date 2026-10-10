// PROTOTYPE (#1421), throwaway: where the "Ya se presentó" mark goes on the
// public program's phone cards. Four variants on /programa, switched with
// `?variant=A|B|C|D` and the floating bar. "Presented" is faked: the first
// third of the chosen day's rows by order. Never merge this file.
import { Check, ChevronLeft, ChevronRight, CircleCheck } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

import type { ProgramListRow } from "./shared";

const prototypeVariants = {
  A: "Badge junto al N.º",
  B: "Check a la derecha, como la columna",
  C: "Tarjeta atenuada + check en el N.º",
  D: "Línea al pie",
} as const;

export type PrototypeVariant = keyof typeof prototypeVariants;

export function usePrototypeVariant(): PrototypeVariant {
  const [params] = useSearchParams();
  const value = params.get("variant");
  return value && value in prototypeVariants
    ? (value as PrototypeVariant)
    : "A";
}

const liveBadgeStyles = {
  "1": "Pastilla roja con punto",
  "2": "Punto y texto, sin pastilla",
  "3": "Pastilla sólida",
} as const;

type LiveBadgeStyle = keyof typeof liveBadgeStyles;

function useLiveBadgeStyle(): LiveBadgeStyle {
  const [params] = useSearchParams();
  const value = params.get("badge");
  return value && value in liveBadgeStyles ? (value as LiveBadgeStyle) : "1";
}

function PulsingDot() {
  return (
    <span className="relative flex size-1.5">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
      <span className="relative inline-flex size-1.5 rounded-full bg-current" />
    </span>
  );
}

export function LiveBadge() {
  const style = useLiveBadgeStyle();

  if (style === "1") {
    return (
      <Badge variant="destructive">
        <PulsingDot />
        En vivo
      </Badge>
    );
  }

  if (style === "2") {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-destructive">
        <PulsingDot />
        En vivo
      </span>
    );
  }

  return <Badge>En vivo</Badge>;
}

export function fakePresentedIds(rows: ProgramListRow[]) {
  const ordered = [...rows].sort(
    (a, b) => (a.orderNumber ?? 0) - (b.orderNumber ?? 0),
  );
  return new Set(
    ordered
      .slice(0, Math.ceil(ordered.length / 3))
      .map((r) => r.choreographyId),
  );
}

/** Wraps the real card's content per variant. */
export function PresentedCardFrame({
  children,
  number,
  presented,
  variant,
}: {
  children: (slots: { numberSlot: ReactNode }) => ReactNode;
  number: string;
  presented: boolean;
  variant: PrototypeVariant;
}) {
  const plainNumber = <>N.º {number || "—"}</>;

  if (variant === "A") {
    return children({
      numberSlot: presented ? (
        <span className="flex items-center gap-2">
          <Badge variant="success">
            <Check />
            Ya se presentó
          </Badge>
          {plainNumber}
        </span>
      ) : (
        plainNumber
      ),
    });
  }

  if (variant === "B") {
    return (
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {children({ numberSlot: plainNumber })}
        </div>
        <div className="flex w-5 shrink-0 justify-center">
          {presented ? (
            <CircleCheck
              aria-label="Ya se presentó"
              className="size-5 text-success"
            />
          ) : null}
        </div>
      </div>
    );
  }

  if (variant === "C") {
    // Everything but the number fades: the name and the lines under it.
    return (
      <div
        className={cn(
          "flex flex-col gap-2",
          presented && "[&>div>div]:opacity-55 [&>p]:opacity-55",
        )}
      >
        {children({
          numberSlot: presented ? (
            <Badge
              variant="success"
              aria-label={`Ya se presentó, N.º ${number}`}
            >
              <Check />
              N.º {number || "—"}
            </Badge>
          ) : (
            plainNumber
          ),
        })}
      </div>
    );
  }

  return (
    <>
      {children({ numberSlot: plainNumber })}
      {presented ? (
        <p className="flex items-center gap-1.5 border-t pt-2 text-xs font-medium text-success">
          <CircleCheck className="size-3.5" />
          Ya se presentó
        </p>
      ) : null}
    </>
  );
}

export function PrototypeSwitcher({ current }: { current: PrototypeVariant }) {
  const [params, setParams] = useSearchParams();
  const keys = Object.keys(prototypeVariants) as PrototypeVariant[];
  const badge = useLiveBadgeStyle();
  const badgeKeys = Object.keys(liveBadgeStyles) as LiveBadgeStyle[];

  function cycleBadge(step: number) {
    const next =
      badgeKeys[
        (badgeKeys.indexOf(badge) + step + badgeKeys.length) % badgeKeys.length
      ];
    const updated = new URLSearchParams(params);
    updated.set("badge", next);
    setParams(updated, { replace: true, preventScrollReset: true });
  }

  function go(step: number) {
    const next =
      keys[(keys.indexOf(current) + step + keys.length) % keys.length];
    const updated = new URLSearchParams(params);
    updated.set("variant", next);
    setParams(updated, { replace: true, preventScrollReset: true });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowUp") cycleBadge(-1);
      if (event.key === "ArrowDown") cycleBadge(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black px-2 py-1.5 text-sm text-white shadow-lg">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => go(-1)}
        className="text-white hover:bg-white/20 hover:text-white"
      >
        <ChevronLeft />
      </Button>
      <span className="whitespace-nowrap">
        {current} · badge {badge} ({liveBadgeStyles[badge]})
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => go(1)}
        className="text-white hover:bg-white/20 hover:text-white"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
