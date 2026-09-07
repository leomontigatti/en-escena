import { ListFilter, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  setFacetedFilterValue,
} from "@/components/shared/data-table-helpers";

type DataTableFacetedFilterControlProps = {
  groups: DataTableFacetedFilter[];
  selectedValues: DataTableFacetedFilterValue;
  onChange: (values: DataTableFacetedFilterValue) => void;
};

/**
 * The filters, in a panel anchored to the right edge of the screen — the mirror
 * of the navigation sidebar on the left. It is closed until the reader asks for
 * it, and the toolbar button is what opens and closes it.
 *
 * It is deliberately not a modal: no overlay, nothing dimmed or blurred, and the
 * page underneath stays scrollable and clickable. Every change applies at once,
 * so the list re-filters while the panel is open and the reader watches it
 * happen instead of committing blind and closing.
 */
export function DataTableFacetedFilterControl({
  groups,
  selectedValues,
  onChange,
}: DataTableFacetedFilterControlProps) {
  const selectedCount = getActiveFacetedFilterValues(selectedValues).length;
  const hasSelectedValues = selectedCount > 0;
  const tooltipId = useId();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const activeFilterSummary = getFacetedFilterSummary(groups, selectedValues);
  const triggerLabel = hasSelectedValues
    ? `Filtros: ${activeFilterSummary}`
    : "Filtros";

  const handleTooltipOpenChange = (open: boolean) => {
    if (open && isPanelOpen) {
      return;
    }

    setIsTooltipOpen(open);
  };

  const togglePanel = () => {
    setIsPanelOpen((wasOpen) => !wasOpen);
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
            aria-expanded={isPanelOpen}
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
      <DataTableFiltersPanel
        activeFilterSummary={activeFilterSummary}
        groups={groups}
        hasSelectedValues={hasSelectedValues}
        onChange={onChange}
        onClose={() => setIsPanelOpen(false)}
        open={isPanelOpen}
        selectedValues={selectedValues}
      />
    </>
  );
}

/**
 * The panel itself, rendered into `document.body` so the edge it sits against is
 * the screen's and not whichever ancestor happens to be positioned. It renders
 * nothing while closed: with no overlay to fade, there is nothing to animate on
 * the way out that the reader would miss.
 */
function DataTableFiltersPanel({
  activeFilterSummary,
  groups,
  hasSelectedValues,
  onChange,
  onClose,
  open,
  selectedValues,
}: {
  activeFilterSummary: string;
  groups: DataTableFacetedFilter[];
  hasSelectedValues: boolean;
  onChange: (values: DataTableFacetedFilterValue) => void;
  onClose: () => void;
  open: boolean;
  selectedValues: DataTableFacetedFilterValue;
}) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <aside
      aria-labelledby={titleId}
      data-slot="data-table-filters-panel"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l bg-sidebar text-sidebar-foreground shadow-lg duration-200 animate-in slide-in-from-right"
    >
      <div className="flex items-start justify-between gap-2 border-b p-4">
        <div className="flex flex-col gap-0.5">
          <p id={titleId} className="font-heading text-base font-medium">
            Filtros
          </p>
          <p className="text-sm text-muted-foreground">
            {hasSelectedValues
              ? activeFilterSummary
              : "Elegí cómo querés acotar la lista."}
          </p>
        </div>
        <Button
          ref={closeButtonRef}
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
        >
          <X data-icon />
          <span className="sr-only">Cerrar filtros</span>
        </Button>
      </div>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        {groups.map((group) => (
          <DataTableFacetedFilterGroupField
            key={group.id}
            group={group}
            selectedValue={selectedValues[group.id] ?? ""}
            onChange={(nextValue) => {
              onChange(
                setFacetedFilterValue(selectedValues, group.id, nextValue),
              );
            }}
          />
        ))}
      </div>
      <div
        data-slot="data-table-filters-panel-footer"
        className="flex flex-col gap-2 border-t p-4"
      >
        <Button
          type="button"
          variant="outline"
          disabled={!hasSelectedValues}
          onClick={() => onChange({})}
        >
          Limpiar filtros
        </Button>
      </div>
    </aside>,
    document.body,
  );
}

/**
 * One group of the panel: its name, its options as radios, and the way back
 * out. The way out is a per-group `Limpiar` rather than an extra `Todos` option,
 * because a group is free to offer an option of its own by that name —the
 * professors list does— and a synthetic one would either duplicate it or take
 * its value away.
 */
function DataTableFacetedFilterGroupField({
  group,
  onChange,
  selectedValue,
}: {
  group: DataTableFacetedFilter;
  onChange: (value: string) => void;
  selectedValue: string;
}) {
  const groupLabelId = useId();
  const hasSelectedValue = selectedValue.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p id={groupLabelId} className="text-sm font-medium text-foreground">
          {group.label}
        </p>
        {hasSelectedValue ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
          >
            Limpiar
          </Button>
        ) : null}
      </div>
      <RadioGroup
        aria-labelledby={groupLabelId}
        value={selectedValue}
        onValueChange={onChange}
      >
        {group.options.map((option) => {
          const optionId = `${groupLabelId}-${option.value}`;

          return (
            <div key={option.value} className="flex items-center gap-2">
              <RadioGroupItem id={optionId} value={option.value} />
              <Label htmlFor={optionId} className="font-normal">
                {option.label}
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </div>
  );
}
