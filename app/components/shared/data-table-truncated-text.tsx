import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { cn } from "@/lib/shared/utils";

/**
 * A cell value that is cut where its column ends, fading out instead of
 * stopping dead. It only means anything inside a `fit` table: there the column
 * width is fixed, so a value that runs long has to be cut somewhere, and this
 * is what decides how that cut reads.
 *
 * The fade is a mask over the last stretch of the cell rather than an ellipsis.
 * It costs no character of the value —an ellipsis eats one— and it is drawn
 * only on a value that is actually cut: the text is measured against its box,
 * and again whenever the box changes width or the web font arrives. A mask
 * alone cannot tell a value that runs long from one that fits with its last
 * letters inside the faded stretch, and it faded both. Until the page hydrates
 * nothing is measured, so a long value is cut hard for that moment.
 *
 * Print is the exception. Paper lays the table out at its own widths, which no
 * measurement taken on screen describes, so there every value keeps the mask
 * and one that fits close to its edge fades a little.
 *
 * A fade is quieter than an "…" and a reader may not notice a value was cut.
 * The `title` is the answer to that: the whole value stays one hover away, and
 * stays selectable and searchable in the page.
 */
export function DataTableTruncatedText({
  children,
  className,
  value,
}: {
  /**
   * What to draw, when the value is not drawn as plain text — a linked name is
   * still the same value and still gets cut the same way. Defaults to `value`.
   */
  children?: ReactNode;
  className?: string;
  value: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isCut = useIsCut(ref, value);

  return (
    <span
      ref={ref}
      title={value}
      data-cut={isCut ? "" : undefined}
      className={cn(
        "block overflow-hidden whitespace-nowrap data-cut:mask-r-from-[calc(100%-1.5rem)] print:mask-r-from-[calc(100%-1.5rem)]",
        className,
      )}
    >
      {children ?? value}
    </span>
  );
}

/** Whether the element's content runs past its box, kept current as it resizes. */
function useIsCut(ref: RefObject<HTMLElement | null>, value: string) {
  const [isCut, setIsCut] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    let isActive = true;
    const measure = () => {
      if (isActive) {
        setIsCut(element.scrollWidth > element.clientWidth);
      }
    };

    measure();
    // The box keeps its width when the web font swaps in, but the text does
    // not, so the font's arrival is a resize the observer never sees.
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
  }, [ref, value]);

  return isCut;
}
