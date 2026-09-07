import { ListFilter } from "lucide-react";
import { useEffect, useId, useState } from "react";
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
import { getActiveFacetedFilterValues } from "@/components/shared/data-table-helpers";
import { getFacetedFilterSummary } from "@/components/shared/data-table-helpers";
import {
  FiltersPanelBody,
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
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [isFallbackOpen, setIsFallbackOpen] = useState(false);
  const region = useFiltersPanelOwner({ groups, onChange, selectedValues });
  const isOpen = region.hasRegion ? region.isOpen : isFallbackOpen;
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
  onClose,
}: {
  content: Parameters<typeof FiltersPanelBody>[0]["content"];
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <aside
      data-slot="filters-panel"
      data-state="open"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l bg-sidebar text-sidebar-foreground shadow-lg"
    >
      <FiltersPanelBody autoFocusClose content={content} onClose={onClose} />
    </aside>,
    document.body,
  );
}
