import type { ReactNode } from "react";

import { cn } from "@/lib/shared/utils";

/**
 * One option of a choice, drawn as a card the whole of which toggles it: a
 * `RadioGroupItem` for one pick, a `Checkbox` for many. As tall as an `Input`,
 * so a grid of them lines up with the fields around it.
 */
export function ChoiceCard({
  children,
  disabled,
  htmlFor,
  label,
}: {
  /** The control, drawn at the card's end. */
  children: ReactNode;
  disabled?: boolean;
  /** The control's `id`, unless the control sits inside and is found by nesting. */
  htmlFor?: string;
  label: string;
}) {
  return (
    <label
      data-slot="choice-card"
      htmlFor={htmlFor}
      className={cn(
        "flex h-8 items-center justify-between gap-2 rounded-lg border border-input px-2.5 text-sm transition-colors has-data-checked:border-primary/30 has-data-checked:bg-primary/5 dark:has-data-checked:border-primary/20 dark:has-data-checked:bg-primary/10",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:bg-muted/50",
      )}
    >
      <span className="truncate">{label}</span>
      {children}
    </label>
  );
}
