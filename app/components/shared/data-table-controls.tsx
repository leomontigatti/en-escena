import { ArrowDown, ArrowUp, ArrowUpDown, ListFilter } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
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
  getFilterGroupQueryParamKey,
  getPaginationPages,
  toggleFacetedFilterValue,
} from "@/components/shared/data-table-helpers";
import { cn } from "@/lib/shared/utils";

type DataTableFacetedFilterControlProps = {
  filter: DataTableFacetedFilter;
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

export function DataTableFacetedFilterControl({
  filter,
  selectedValues,
  onChange,
}: DataTableFacetedFilterControlProps) {
  const selectedCount = getActiveFacetedFilterValues(selectedValues).length;
  const hasSelectedValues = selectedCount > 0;
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const activeFilterSummary = getFacetedFilterSummary(filter, selectedValues);
  const triggerLabel = hasSelectedValues
    ? `${filter.label}: ${activeFilterSummary}`
    : filter.label;

  const handleTooltipOpenChange = (open: boolean) => {
    if (open && isDropdownOpen) {
      return;
    }

    setIsTooltipOpen(open);
  };

  const handleDropdownOpenChange = (open: boolean) => {
    setIsDropdownOpen(open);

    if (open) {
      setIsTooltipOpen(false);
    }
  };

  const preventTriggerFocusAfterDropdownClose = (event: Event) => {
    event.preventDefault();
    triggerRef.current?.blur();
    setIsTooltipOpen(false);
  };

  return (
    <Tooltip open={isTooltipOpen} onOpenChange={handleTooltipOpenChange}>
      <DropdownMenu
        open={isDropdownOpen}
        onOpenChange={handleDropdownOpenChange}
      >
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
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
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56"
          onCloseAutoFocus={preventTriggerFocusAfterDropdownClose}
        >
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled={!hasSelectedValues}
              onSelect={() => onChange({})}
            >
              Limpiar filtros
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {filter.groups.map((group) => {
            const groupId = getFilterGroupQueryParamKey(group);
            const selectedValue = selectedValues[groupId] ?? "";

            return (
              <DropdownMenuGroup key={groupId}>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={selectedValue}
                  onValueChange={(nextValue) => {
                    onChange(
                      toggleFacetedFilterValue(
                        selectedValues,
                        groupId,
                        nextValue,
                      ),
                    );
                  }}
                >
                  {group.options.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <TooltipContent id={tooltipId} side="left" sideOffset={6}>
        {filter.label}
      </TooltipContent>
    </Tooltip>
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
