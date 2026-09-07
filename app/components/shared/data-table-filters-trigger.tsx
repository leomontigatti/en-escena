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
  type FiltersPanelContent,
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

/**
 * Which panel this trigger drives, and how to work it.
 *
 * A trigger inside a shell drives the shell's panel, which is one panel shared
 * by the page. A trigger with no shell around it drives one of its own. The
 * difference is answered here so that the trigger below only has a panel that
 * opens and closes, whichever of the two it turned out to be.
 */
function useFiltersPanelTarget(content: FiltersPanelContent) {
  const fallbackPanelId = useId();
  const [isFallbackOpen, setIsFallbackOpen] = useState(false);
  const shellPanel = useFiltersPanelOwner(content);
  const hasFallback = !shellPanel.isAvailable;

  return {
    closeFallback: () => setIsFallbackOpen(false),
    fallbackPanelId,
    isFallbackShowing: hasFallback && isFallbackOpen,
    isOpen: hasFallback ? isFallbackOpen : shellPanel.isOpen,
    // The shell's panel is drawn whether or not it is open, so the trigger can
    // point at it either way; its own is only there once it has been opened.
    panelId: hasFallback
      ? isFallbackOpen
        ? fallbackPanelId
        : undefined
      : FILTERS_PANEL_REGION_ID,
    toggle: () => {
      if (hasFallback) {
        setIsFallbackOpen((wasOpen) => !wasOpen);
      } else {
        shellPanel.toggle();
      }
    },
  };
}

/** The count of groups the reader has narrowed the list by. */
function SelectedFilterCountBadge({ count }: { count: number }) {
  return (
    <Badge
      variant="secondary"
      className="pointer-events-none absolute -top-2 -right-2 min-w-5 justify-center px-1"
    >
      {count}
    </Badge>
  );
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const panel = useFiltersPanelTarget({ groups, onChange, selectedValues });

  useReturnFocusOnClose(panel.isOpen, triggerRef, setIsTooltipOpen);
  const triggerLabel = hasSelectedValues
    ? `Filtros: ${getFacetedFilterSummary(groups, selectedValues)}`
    : "Filtros";

  const handleTooltipOpenChange = (open: boolean) => {
    if (open && panel.isOpen) {
      return;
    }

    setIsTooltipOpen(open);
  };

  const togglePanel = () => {
    panel.toggle();
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
            aria-controls={panel.panelId}
            aria-describedby={tooltipId}
            aria-expanded={panel.isOpen}
            aria-label={triggerLabel}
            className="relative"
            onClick={togglePanel}
          >
            <ListFilter data-icon />
            {hasSelectedValues ? (
              <SelectedFilterCountBadge count={selectedCount} />
            ) : null}
            <span className="sr-only">{triggerLabel}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent id={tooltipId} side="left" sideOffset={6}>
          Filtros
        </TooltipContent>
      </Tooltip>
      {panel.isFallbackShowing ? (
        <StandaloneFiltersPanel
          id={panel.fallbackPanelId}
          content={{ groups, onChange, selectedValues }}
          onClose={panel.closeFallback}
        />
      ) : null}
    </>
  );
}
