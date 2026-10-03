import { useLayoutEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/shared/utils";

function BadgesList({
  className,
  labels,
}: {
  className?: string;
  labels: string[];
}) {
  if (labels.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {labels.map((label, index) => (
        <Badge key={`${label}-${index}`} variant="secondary">
          {label}
        </Badge>
      ))}
    </div>
  );
}

/**
 * How many badges a single row spells out before it folds the rest into a
 * counter: all of them when they fit, and otherwise as many as leave room for
 * the counter. The first one is kept even when it does not fit, since a counter
 * alone says nothing about what the row holds.
 */
function countFittingBadges({
  available,
  counterWidth,
  gap,
  widths,
}: {
  available: number;
  /** The width of the badge that counts the folded ones. */
  counterWidth: number;
  gap: number;
  widths: readonly number[];
}): number {
  const total =
    widths.reduce((sum, width) => sum + width, 0) +
    gap * Math.max(widths.length - 1, 0);

  if (total <= available) {
    return widths.length;
  }

  let used = counterWidth;
  let count = 0;

  for (const width of widths) {
    used += width + gap;

    if (used > available) {
      break;
    }

    count += 1;
  }

  return Math.min(Math.max(count, 1), widths.length);
}

/**
 * Badges kept on one line: the ones that do not fit the column fold into a
 * counter whose `title` names them. It is for a `fit` table, where the column
 * has a width of its own to be measured against; in an `auto` one the column
 * grows to hold every badge and nothing ever folds.
 *
 * The folded badges stay in the DOM, out of the flow and unseen, so they can be
 * measured again when the column changes width or the web font arrives. Until
 * the page hydrates nothing is measured, so a long row is cut hard for that
 * moment.
 */
function FoldedBadgesList({ labels }: { labels: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(labels.length);
  const labelsKey = labels.join("\n");
  const hiddenLabels = labels.slice(visibleCount);

  // The counter's own width changes with the number it shows, so the row is
  // measured again after each fold until the count settles.
  useLayoutEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    let isActive = true;
    const measure = () => {
      if (!isActive) {
        return;
      }

      const badges = Array.from(element.children) as HTMLElement[];
      const counter = badges.pop();

      setVisibleCount(
        countFittingBadges({
          available: element.clientWidth,
          counterWidth: counter?.offsetWidth ?? 0,
          gap: Number.parseFloat(getComputedStyle(element).columnGap) || 0,
          widths: badges.map((badge) => badge.offsetWidth),
        }),
      );
    };

    measure();
    void document.fonts?.ready.then(measure);

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(element);

    return () => {
      isActive = false;
      observer?.disconnect();
    };
  }, [labelsKey, visibleCount]);

  if (labels.length === 0) {
    return null;
  }

  return (
    <div ref={ref} className="relative flex items-center gap-2 overflow-hidden">
      {labels.map((label, index) => (
        <Badge
          key={`${label}-${index}`}
          variant="secondary"
          className={cn(index >= visibleCount && "invisible absolute")}
        >
          {label}
        </Badge>
      ))}
      <Badge
        variant="secondary"
        title={hiddenLabels.join(", ")}
        className={cn(hiddenLabels.length === 0 && "invisible absolute")}
      >
        {hiddenLabels.length}+
      </Badge>
    </div>
  );
}

export { BadgesList, countFittingBadges, FoldedBadgesList };
