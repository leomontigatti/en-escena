import { ArrowDown, ArrowUp, ArrowUpDown, ListFilter } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  DataTableFacetedFilter,
  DataTableFacetedFilterValue,
  DataTableSortDirection,
} from "@/components/shared/data-table.shared";
import {
  getActiveFacetedFilterValues,
  getFacetedFilterSummary,
  getPaginationPages,
  setFacetedFilterValue,
} from "@/components/shared/data-table-helpers";
import { cn } from "@/lib/shared/utils";

type DataTableFacetedFilterControlProps = {
  groups: DataTableFacetedFilter[];
  selectedValues: DataTableFacetedFilterValue;
  onChange: (values: DataTableFacetedFilterValue) => void;
};

type DataTablePaginationProps = {
  basePath: string;
  pageCount: number;
  currentPage: number;
  canPreviousPage: boolean;
  canNextPage: boolean;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  onPageChange?: (page: number) => void;
  pageHrefBuilder?: (page: number) => string;
};

type SortIconProps = {
  direction?: DataTableSortDirection | false;
};

/**
 * The filters, in a drawer that comes in from the right — the mirror of the
 * navigation sidebar, which comes in from the left. A dropdown could only show
 * the groups as a stacked menu; a panel gives each group its own labelled block
 * and leaves room for the list to grow.
 *
 * Every change applies at once, so the panel has no "Aplicar": the table behind
 * it narrows while it is open. `Todos` is what clears a single group, and the
 * footer clears them all.
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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const activeFilterSummary = getFacetedFilterSummary(groups, selectedValues);
  const triggerLabel = hasSelectedValues
    ? `Filtros: ${activeFilterSummary}`
    : "Filtros";

  const handleTooltipOpenChange = (open: boolean) => {
    if (open && isDrawerOpen) {
      return;
    }

    setIsTooltipOpen(open);
  };

  const handleDrawerOpenChange = (open: boolean) => {
    setIsDrawerOpen(open);

    if (open) {
      setIsTooltipOpen(false);
    }
  };

  const preventTriggerFocusAfterDrawerClose = (event: Event) => {
    event.preventDefault();
    triggerRef.current?.blur();
    setIsTooltipOpen(false);
  };

  return (
    <Tooltip open={isTooltipOpen} onOpenChange={handleTooltipOpenChange}>
      <Sheet open={isDrawerOpen} onOpenChange={handleDrawerOpenChange}>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button
              ref={triggerRef}
              type="button"
              variant="outline"
              size="icon-sm"
              aria-describedby={tooltipId}
              aria-label={triggerLabel}
              className="relative"
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
          </SheetTrigger>
        </TooltipTrigger>
        <SheetContent
          side="right"
          className="gap-0 bg-background"
          onCloseAutoFocus={preventTriggerFocusAfterDrawerClose}
        >
          <SheetHeader className="border-b">
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>
              {hasSelectedValues
                ? activeFilterSummary
                : "Elegí cómo querés acotar la lista."}
            </SheetDescription>
          </SheetHeader>
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
          <SheetFooter className="border-t">
            <Button
              type="button"
              variant="outline"
              disabled={!hasSelectedValues}
              onClick={() => onChange({})}
            >
              Limpiar filtros
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <TooltipContent id={tooltipId} side="left" sideOffset={6}>
        Filtros
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * One group of the drawer: its name, its options as radios, and the way back
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

export function DataTablePagination({
  basePath,
  pageCount,
  currentPage,
  canPreviousPage,
  canNextPage,
  onPreviousPage,
  onNextPage,
  onPageChange,
  pageHrefBuilder,
}: DataTablePaginationProps) {
  const pages = getPaginationPages(pageCount, currentPage);
  const previousHref =
    pageHrefBuilder?.(Math.max(1, currentPage - 1)) ?? basePath;
  const nextHref =
    pageHrefBuilder?.(Math.min(pageCount, currentPage + 1)) ?? basePath;

  return (
    <Pagination className="mx-0 w-auto justify-end">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={previousHref}
            text="Anterior"
            aria-disabled={!canPreviousPage}
            tabIndex={canPreviousPage ? undefined : -1}
            className={cn(!canPreviousPage && "pointer-events-none opacity-50")}
            onClick={(event) => {
              if (!canPreviousPage) {
                event.preventDefault();
                return;
              }

              if (pageHrefBuilder) {
                return;
              }

              event.preventDefault();
              onPreviousPage?.();
            }}
          />
        </PaginationItem>
        {pages.map((page) => (
          <PaginationItem key={page}>
            {page === "ellipsis" ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink
                href={pageHrefBuilder?.(page) ?? basePath}
                isActive={page === currentPage}
                onClick={(event) => {
                  if (pageHrefBuilder) {
                    return;
                  }

                  event.preventDefault();
                  onPageChange?.(page);
                }}
              >
                {page}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            href={nextHref}
            text="Siguiente"
            aria-disabled={!canNextPage}
            tabIndex={canNextPage ? undefined : -1}
            className={cn(!canNextPage && "pointer-events-none opacity-50")}
            onClick={(event) => {
              if (!canNextPage) {
                event.preventDefault();
                return;
              }

              if (pageHrefBuilder) {
                return;
              }

              event.preventDefault();
              onNextPage?.();
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

export function SortIcon({ direction }: SortIconProps) {
  if (direction === "asc") {
    return <ArrowUp data-icon="inline-end" />;
  }

  if (direction === "desc") {
    return <ArrowDown data-icon="inline-end" />;
  }

  return <ArrowUpDown data-icon="inline-end" />;
}
