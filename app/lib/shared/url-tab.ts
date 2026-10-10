import { useSearchParams } from "react-router";

/**
 * The parameter names what the tab picks, and a name is shared by every page
 * whose tabs pick the same thing.
 */
export const kindTabParam = "tipo";
export const dayTabParam = "dia";

/**
 * The active tab of a set that switches what a whole page lists, kept in the
 * URL so a reload or a shared link lands on the same tab. Spread the result on
 * `Tabs`: `value` and `onValueChange` are its two props, and going through
 * `onValueChange` rather than a click handler on each trigger is what lets the
 * arrow keys switch tabs too.
 *
 * - The default tab is the absence of the parameter, not a value for it: the
 *   URL only ever names a tab the page does not open on.
 * - `openingValue`, when given, is the tab a URL naming none opens on in
 *   place of the default. The plain link then no longer means the default,
 *   so every tab chosen is named, the default included.
 * - A value the page does not have opens as if none were named. An old link
 *   is stale, not broken.
 * - A switch replaces the history entry and keeps the scroll, so Back leaves
 *   the page instead of stepping through the tabs.
 * - `resets` names the parameters that belong to the tab being left, a page
 *   number for one, and are dropped with it.
 */
export function useUrlTab<TValue extends string>({
  defaultValue,
  openingValue = defaultValue,
  param,
  resets = [],
  values,
}: {
  defaultValue: NoInfer<TValue>;
  openingValue?: NoInfer<TValue>;
  param: string;
  resets?: readonly string[];
  values: readonly TValue[];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const named = searchParams.get(param);
  const value = values.find((candidate) => candidate === named) ?? openingValue;
  const onValueChange = (next: string) => {
    setSearchParams(
      (current) => {
        const nextParams = new URLSearchParams(current);

        if (next === defaultValue && openingValue === defaultValue) {
          nextParams.delete(param);
        } else {
          nextParams.set(param, next);
        }

        for (const reset of resets) {
          nextParams.delete(reset);
        }

        return nextParams;
      },
      { preventScrollReset: true, replace: true },
    );
  };

  return { onValueChange, value };
}
