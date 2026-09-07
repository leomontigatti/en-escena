import { cn } from "@/lib/shared/utils";

/**
 * A cell value that is cut where its column ends, fading out instead of
 * stopping dead. It only means anything inside a `fit` table: there the column
 * width is fixed, so a value that runs long has to be cut somewhere, and this
 * is what decides how that cut reads.
 *
 * The fade is a mask over the last stretch of the cell rather than an ellipsis.
 * It costs no character of the value —an ellipsis eats one— and it needs no
 * measuring: a value that stops before the mask starts is drawn whole, so short
 * values look untouched and only a value that actually reaches the edge shows
 * the fade. That is also its one weakness, since a fade is quieter than an "…"
 * and a reader may not notice a value was cut. The `title` is the answer to
 * that: the whole value stays one hover away, and stays selectable and
 * searchable in the page.
 */
export function DataTableTruncatedText({
  className,
  value,
}: {
  className?: string;
  value: string;
}) {
  return (
    <span
      title={value}
      className={cn(
        "block overflow-hidden whitespace-nowrap mask-r-from-[calc(100%-1.5rem)]",
        className,
      )}
    >
      {value}
    </span>
  );
}
