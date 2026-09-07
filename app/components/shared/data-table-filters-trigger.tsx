import { ListFilter } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  DataTableFacetedFilter,
  DataTableFacetedFilterValue,
} from "@/components/shared/data-table.shared";
import {
  getActiveFacetedFilterValues,
  getFacetedFilterSummary,
} from "@/components/shared/data-table-helpers";
import {
  FILTERS_PANEL_REGION_ID,
  StandaloneFiltersPanel,
  useFiltersPanelOwner,
} from "@/components/shared/filters-panel";

/**
 * A closed panel is `inert`, and an `inert` panel cannot hold what is focused
 * inside it: were the reader left there, the keyboard would drop to the top of
 * the page. So the trigger takes focus back —but only if the panel still had
 * it, since the reader is free to be somewhere else entirely by then.
 *
 * Taking focus would bring the tooltip along with it, which is why the dropdown
 * this replaced blurred its trigger rather than keeping it. Here the tooltip is
 * closed in the same breath instead, so the focus can stay where the keyboard
 * needs it without the label following it back.
 */
function useReturnFocusOnClose(
  isOpen: boolean,
  triggerRef: RefObject<HTMLButtonElement | null>,
  hideTooltip: Dispatch<SetStateAction<boolean>>,
) {
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;

    if (!wasOpen || isOpen) {
      return;
    }

    const focused = document.activeElement;
    const wasLeftInThePanel =
      focused === null ||
      focused === document.body ||
      focused.closest('[data-slot="filters-panel"]') !== null;

    if (wasLeftInThePanel) {
      triggerRef.current?.focus();
      hideTooltip(false);
    }
  }, [hideTooltip, isOpen, triggerRef]);
}

type DataTableFacetedFilterControlProps = {
  groups: DataTableFacetedFilter[];
  selectedValues: DataTableFacetedFilterValue;
  onChange: (values: DataTableFacetedFilterValue) => void;
};

/**
 * The toolbar button that opens the filters, and the filters themselves.
 *
 * The panel it opens belongs to the shell, at the right edge of the layout:
 * opening it narrows the page the way the navigation sidebar does, rather than
 * covering the list being filtered. The button stays here, next to the table,
 * because that is where the reader looks for it.
 *
 * A table rendered outside a shell —a test, or a surface with no panel region—
 * keeps its filters in a panel of its own against the right edge of the screen.
 * It cannot push what it is not laid out beside, but it is the same panel, and
 * a table is never left without a way to filter.
 */
export function DataTableFacetedFilterControl({
  groups,
  selectedValues,
  onChange,
}: DataTableFacetedFilterControlProps) {
  const selectedCount = getActiveFacetedFilterValues(selectedValues).length;
  const hasSelectedValues = selectedCount > 0;
  const tooltipId = useId();
  const fallbackPanelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [isFallbackOpen, setIsFallbackOpen] = useState(false);
  const shellPanel = useFiltersPanelOwner({ groups, onChange, selectedValues });
  const isOpen = shellPanel.isAvailable ? shellPanel.isOpen : isFallbackOpen;
  // The shell's panel is drawn whether or not it is open, so the trigger can
  // point at it either way; its own is only there once it has been opened.
  const controlledPanelId = shellPanel.isAvailable
    ? FILTERS_PANEL_REGION_ID
    : isFallbackOpen
      ? fallbackPanelId
      : undefined;

  useReturnFocusOnClose(isOpen, triggerRef, setIsTooltipOpen);
  const triggerLabel = hasSelectedValues
    ? `Filtros: ${getFacetedFilterSummary(groups, selectedValues)}`
    : "Filtros";

  const handleTooltipOpenChange = (open: boolean) => {
    if (open && isOpen) {
      return;
    }

    setIsTooltipOpen(open);
  };

  const togglePanel = () => {
    if (shellPanel.isAvailable) {
      shellPanel.toggle();
    } else {
      setIsFallbackOpen((wasOpen) => !wasOpen);
    }

    setIsTooltipOpen(false);
  };

  return (
    <>
      <Tooltip open={isTooltipOpen} onOpenChange={handleTooltipOpenChange}>
        <TooltipTrigger asChild>
          <Button
            ref={triggerRef}
            type="button"
            variant="outline"
            size="icon-sm"
            aria-controls={controlledPanelId}
            aria-describedby={tooltipId}
            aria-expanded={isOpen}
            aria-label={triggerLabel}
            className="relative"
            onClick={togglePanel}
          >
            <ListFilter data-icon />
            {hasSelectedValues ? (
              <Badge
                variant="secondary"
                className="pointer-events-none absolute -top-2 -right-2 min-w-5 justify-center px-1"
              >
                {selectedCount}
              </Badge>
            ) : null}
            <span className="sr-only">{triggerLabel}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent id={tooltipId} side="left" sideOffset={6}>
          Filtros
        </TooltipContent>
      </Tooltip>
      {!shellPanel.isAvailable && isFallbackOpen ? (
        <StandaloneFiltersPanel
          id={fallbackPanelId}
          content={{ groups, onChange, selectedValues }}
          onClose={() => setIsFallbackOpen(false)}
        />
      ) : null}
    </>
  );
}
