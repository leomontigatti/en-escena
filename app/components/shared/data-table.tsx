import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnDef,
  type ColumnFiltersState,
  type RowData,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Search,
  X,
  ListFilter,
} from "lucide-react";
import type * as React from "react";
import { useMemo, useState } from "react";

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
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/shared/utils";

type SortDirection = "asc" | "desc";

type SortValue = string | number | Date | boolean | null | undefined;

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
    headerClassName?: string;
  }
}

export type DataTableColumn<TData> = {
  id: string;
  header: string;
  cell: (row: TData) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  filterValue?: (row: TData) => string;
  filterValues?: (row: TData) => string[];
  sortValue?: (row: TData) => SortValue;
};

type DataTableFacetedFilter = {
  columnId: string;
  label: string;
  groups: DataTableFacetedFilterGroup[];
};

type DataTableFacetedFilterGroup = {
  label: string;
  options: DataTableFacetedFilterOption[];
};

type DataTableFacetedFilterOption = {
  label: string;
  value: string;
};

type DataTableFacetedFilterValue = Record<string, string>;

type DataTableProps<TData> = {
  rows: TData[];
  columns: DataTableColumn<TData>[];
  getRowKey: (row: TData) => string;
  getRowProps?: (row: TData) => React.ComponentProps<"tr">;
  searchPlaceholder: string;
  textFilterColumnId?: string;
  facetedFilters?: DataTableFacetedFilter[];
  emptyMessage?: string;
  initialFacetedFilterValues?: Record<string, DataTableFacetedFilterValue>;
  initialSort?: {
    columnId: string;
    direction: SortDirection;
  };
};

export function DataTable<TData>({
  rows,
  columns,
  getRowKey,
  getRowProps,
  searchPlaceholder,
  textFilterColumnId,
  facetedFilters = [],
  emptyMessage = "No hay resultados para mostrar.",
  initialFacetedFilterValues = {},
  initialSort,
}: DataTableProps<TData>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() =>
    Object.entries(initialFacetedFilterValues).map(([columnId, value]) => ({
      id: columnId,
      value,
    })),
  );
  const [sorting, setSorting] = useState<SortingState>(
    initialSort
      ? [{ id: initialSort.columnId, desc: initialSort.direction === "desc" }]
      : [],
  );

  const tableColumns = useMemo(
    () =>
      columns.map<ColumnDef<TData>>((column) => ({
        id: column.id,
        header: column.header,
        cell: ({ row }) => column.cell(row.original),
        enableSorting: Boolean(column.sortValue),
        accessorFn: (row) =>
          column.sortValue?.(row) ?? column.filterValue?.(row),
        filterFn: (row, _columnId, filterValue) => {
          if (isFacetedFilterValue(filterValue)) {
            const selectedValues = Object.values(filterValue).filter(Boolean);

            if (selectedValues.length === 0) {
              return true;
            }

            const rowValues =
              column.filterValues?.(row.original) ??
              (column.filterValue ? [column.filterValue(row.original)] : []);

            return selectedValues.every((selectedValue) =>
              rowValues.some(
                (rowValue) =>
                  normalizeSearchValue(rowValue) ===
                  normalizeSearchValue(selectedValue),
              ),
            );
          }

          const normalizedQuery = normalizeSearchValue(String(filterValue));

          if (normalizedQuery.length === 0) {
            return true;
          }

          const value = column.filterValue?.(row.original);

          return value
            ? normalizeSearchValue(value).includes(normalizedQuery)
            : false;
        },
        sortingFn: (firstRow, secondRow) =>
          compareSortValues(
            column.sortValue?.(firstRow.original),
            column.sortValue?.(secondRow.original),
          ),
        meta: {
          className: column.className,
          headerClassName: column.headerClassName,
        },
      })),
    [columns],
  );

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: {
      columnFilters,
      globalFilter: textFilterColumnId ? "" : searchQuery,
      sorting,
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setSearchQuery,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: getRowKey,
    globalFilterFn: (row, _columnId, filterValue) =>
      columns.some((column) => {
        const normalizedQuery = normalizeSearchValue(String(filterValue));

        if (normalizedQuery.length === 0) {
          return true;
        }

        const value = column.filterValue?.(row.original);

        return value
          ? normalizeSearchValue(value).includes(normalizedQuery)
          : false;
      }),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const filteredRows = table.getFilteredRowModel().rows;
  const visibleRows = table.getRowModel().rows;
  const totalRows = table.getCoreRowModel().rows.length;
  const pageCount = table.getPageCount();
  const currentPage = table.getState().pagination.pageIndex + 1;

  const setSearchFilter = (value: string) => {
    setSearchQuery(value);

    if (textFilterColumnId) {
      table.getColumn(textFilterColumnId)?.setFilterValue(value);
      return;
    }

    table.setGlobalFilter(value);
  };

  const clearSearchFilter = () => {
    setSearchFilter("");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <label className="relative block sm:max-w-sm sm:flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <span className="sr-only">Buscar en la tabla</span>
            <Input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchFilter(event.target.value)}
              placeholder={searchPlaceholder}
              className="pr-8 pl-8"
            />
            {searchQuery.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute top-1/2 right-1 -translate-y-1/2"
                onClick={clearSearchFilter}
              >
                <X aria-hidden="true" />
                <span className="sr-only">Limpiar búsqueda</span>
              </Button>
            ) : null}
          </label>
          {facetedFilters.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-2">
              {facetedFilters.map((filter) => (
                <DataTableFacetedFilterControl
                  key={filter.columnId}
                  filter={filter}
                  selectedValues={getSelectedFilterValues(
                    table,
                    filter.columnId,
                  )}
                  onChange={(values) =>
                    table.getColumn(filter.columnId)?.setFilterValue(values)
                  }
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "px-3",
                      header.column.columnDef.meta?.headerClassName,
                    )}
                  >
                    {header.column.getCanSort() ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-2"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        <SortIcon
                          direction={toSortDirection(
                            header.column.getIsSorted(),
                          )}
                        />
                      </Button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {visibleRows.length > 0 ? (
              visibleRows.map((row) => {
                const rowProps = getRowProps?.(row.original) ?? {};

                return (
                  <TableRow key={row.id} {...rowProps}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "px-3",
                          cell.column.columnDef.meta?.className,
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredRows.length} de {totalRows}{" "}
          {totalRows === 1 ? "registro" : "registros"}
        </p>
        <DataTablePagination
          pageCount={pageCount}
          currentPage={currentPage}
          canPreviousPage={table.getCanPreviousPage()}
          canNextPage={table.getCanNextPage()}
          onPreviousPage={() => table.previousPage()}
          onNextPage={() => table.nextPage()}
          onPageChange={(page) => table.setPageIndex(page - 1)}
        />
      </div>
    </div>
  );
}

function DataTableFacetedFilterControl({
  filter,
  selectedValues,
  onChange,
}: {
  filter: DataTableFacetedFilter;
  selectedValues: DataTableFacetedFilterValue;
  onChange: (values: DataTableFacetedFilterValue) => void;
}) {
  const selectedCount = Object.values(selectedValues).filter(Boolean).length;
  const hasSelectedValues = selectedCount > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">
          <ListFilter data-icon="inline-start" />
          {filter.label}
          {hasSelectedValues ? (
            <Badge variant="secondary">{selectedCount}</Badge>
          ) : null}
          <ChevronDown data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={!hasSelectedValues}
            onSelect={() => onChange({})}
          >
            Limpiar filtros
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {filter.groups.map((group) => {
          const selectedValue = selectedValues[group.label] ?? "";

          return (
            <DropdownMenuGroup key={group.label}>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={selectedValue}
                onValueChange={(nextValue) => {
                  const nextValues = { ...selectedValues };

                  if (nextValue === selectedValue) {
                    delete nextValues[group.label];
                  } else {
                    nextValues[group.label] = nextValue;
                  }

                  onChange(nextValues);
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
  );
}

function DataTablePagination({
  pageCount,
  currentPage,
  canPreviousPage,
  canNextPage,
  onPreviousPage,
  onNextPage,
  onPageChange,
}: {
  pageCount: number;
  currentPage: number;
  canPreviousPage: boolean;
  canNextPage: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onPageChange: (page: number) => void;
}) {
  const pages = getPaginationPages(pageCount, currentPage);

  return (
    <Pagination className="mx-0 w-auto justify-end">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            text="Anterior"
            aria-disabled={!canPreviousPage}
            tabIndex={canPreviousPage ? undefined : -1}
            className={cn(!canPreviousPage && "pointer-events-none opacity-50")}
            onClick={(event) => {
              event.preventDefault();

              if (canPreviousPage) {
                onPreviousPage();
              }
            }}
          />
        </PaginationItem>
        {pages.map((page) => (
          <PaginationItem key={page}>
            <PaginationLink
              href="#"
              isActive={page === currentPage}
              onClick={(event) => {
                event.preventDefault();
                onPageChange(page);
              }}
            >
              {page}
            </PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            href="#"
            text="Siguiente"
            aria-disabled={!canNextPage}
            tabIndex={canNextPage ? undefined : -1}
            className={cn(!canNextPage && "pointer-events-none opacity-50")}
            onClick={(event) => {
              event.preventDefault();

              if (canNextPage) {
                onNextPage();
              }
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function SortIcon({ direction }: { direction?: SortDirection | false }) {
  if (direction === "asc") {
    return <ArrowUp data-icon="inline-end" />;
  }

  if (direction === "desc") {
    return <ArrowDown data-icon="inline-end" />;
  }

  return <ArrowUpDown data-icon="inline-end" />;
}

function getSelectedFilterValues<TData>(
  table: ReturnType<typeof useReactTable<TData>>,
  columnId: string,
) {
  const filterValue = table.getColumn(columnId)?.getFilterValue();

  return isFacetedFilterValue(filterValue) ? filterValue : {};
}

function getPaginationPages(pageCount: number, currentPage: number) {
  if (pageCount <= 1) {
    return [1];
  }

  const pages = new Set([1, currentPage - 1, currentPage, currentPage + 1]);

  pages.add(pageCount);

  return Array.from(pages)
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((firstPage, secondPage) => firstPage - secondPage);
}

function toSortDirection(sortValue: false | SortDirection) {
  return sortValue === "asc" || sortValue === "desc" ? sortValue : false;
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-AR")
    .trim();
}

function isFacetedFilterValue(
  value: unknown,
): value is DataTableFacetedFilterValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareSortValues(firstValue: SortValue, secondValue: SortValue) {
  if (firstValue === secondValue) {
    return 0;
  }

  if (firstValue === null || firstValue === undefined) {
    return 1;
  }

  if (secondValue === null || secondValue === undefined) {
    return -1;
  }

  if (firstValue instanceof Date && secondValue instanceof Date) {
    return firstValue.getTime() - secondValue.getTime();
  }

  if (typeof firstValue === "number" && typeof secondValue === "number") {
    return firstValue - secondValue;
  }

  if (typeof firstValue === "boolean" && typeof secondValue === "boolean") {
    return Number(firstValue) - Number(secondValue);
  }

  return String(firstValue).localeCompare(String(secondValue), "es-AR", {
    sensitivity: "base",
    numeric: true,
  });
}
