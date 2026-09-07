import { ListFilter } from "lucide-react";
import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  FiltersPanelBody,
  useCloseOnEscape,
  useFiltersPanelOwner,
} from "@/components/shared/filters-panel";

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
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [isFallbackOpen, setIsFallbackOpen] = useState(false);
  const region = useFiltersPanelOwner({ groups, onChange, selectedValues });
  const isOpen = region.hasRegion ? region.isOpen : isFallbackOpen;
  // The shell's panel is drawn whether or not it is open, so the trigger can
  // point at it either way; its own is only there once it has been opened.
  const controlledPanelId = region.hasRegion
    ? FILTERS_PANEL_REGION_ID
    : isFallbackOpen
      ? fallbackPanelId
      : undefined;
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
    if (region.hasRegion) {
      region.toggle();
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
      {!region.hasRegion && isFallbackOpen ? (
        <DataTableStandaloneFiltersPanel
          id={fallbackPanelId}
          content={{ groups, onChange, selectedValues }}
          onClose={() => setIsFallbackOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * The panel for a table with no shell around it. It is portalled to the body so
 * that the edge it sits against is the screen's and not whichever ancestor
 * happens to be positioned.
 */
function DataTableStandaloneFiltersPanel({
  content,
  id,
  onClose,
}: {
  content: Parameters<typeof FiltersPanelBody>[0]["content"];
  id: string;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLElement>(null);

  useCloseOnEscape(true, onClose, containerRef);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <aside
      ref={containerRef}
      id={id}
      data-slot="filters-panel"
      data-state="open"
      // The width is the shell panel's, so the two cannot drift apart. Read
      // through a default because a table outside a shell is also outside the
      // sidebar that would otherwise be setting the variable.
      className="fixed inset-y-0 right-0 z-40 flex w-[var(--sidebar-width,16rem)] max-w-full flex-col border-l bg-sidebar text-sidebar-foreground shadow-lg"
    >
      <FiltersPanelBody autoFocusClose content={content} onClose={onClose} />
    </aside>,
    document.body,
  );
}
