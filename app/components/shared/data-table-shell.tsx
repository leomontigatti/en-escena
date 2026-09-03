import {
  flexRender,
  type Header,
  type Row,
  type Table as TanStackTable,
} from "@tanstack/react-table";
import { LoaderCircle, Search, X } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataTableFacetedFilterControl,
  DataTablePagination,
  SortIcon,
} from "@/components/shared/data-table-controls";
import { toSortDirection } from "@/components/shared/data-table-helpers";
import type {
  DataTableFacetedFilter,
  DataTableFacetedFilterValue,
  DataTableSortDirection,
} from "@/components/shared/data-table.shared";
import { dataTableFacetedFilterColumnId } from "@/components/shared/data-table.shared";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/shared/utils";

/** What the search box needs, and whether it is offered at all. */
type DataTableSearchProps = {
  hidden?: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  query: string;
};

/** The faceted filters, and how to read and write what is selected. */
type DataTableFiltersProps = {
  getSelectedValues: (columnId: string) => DataTableFacetedFilterValue;
  groups: DataTableFacetedFilter[];
  onChange: (values: DataTableFacetedFilterValue) => void;
};

/**
 * The footer: how much of the set is on screen, and the way to the rest. The
 * client table moves by callback and the server table by href, so both are
 * optional and each table fills in the pair it uses.
 */
type DataTablePaginationProps = {
  basePath: string;
  canNextPage: boolean;
  canPreviousPage: boolean;
  currentPage: number;
  filteredRowCount: number;
  hidden?: boolean;
  hrefBuilder?: (page: number) => string;
  onNextPage?: () => void;
  onPageChange?: (page: number) => void;
  onPreviousPage?: () => void;
  pageCount: number;
  totalRows: number;
};

/**
 * The server table's sort, which lives in the URL. It is absent on the client
 * table, and that absence is what tells a header to sort by button rather than
 * by link.
 */
type DataTableServerSortProps = {
  getDirection?: (columnId: string) => DataTableSortDirection | false;
  getHref: (columnId: string) => string;
};

/**
 * Grouped by region rather than flat. Twenty-five loose props said nothing
 * about which of them belong together; these four say which part of the table
 * each one is about, and a caller that fills in `serverSort` is answering one
 * question rather than remembering two prefixes.
 */
type DataTableShellProps<TData> = {
  emptyMessage: string;
  filters: DataTableFiltersProps;
  getRowProps?: (row: TData) => React.ComponentProps<"tr">;
  isLoading: boolean;
  pagination: DataTablePaginationProps;
  search: DataTableSearchProps;
  serverSort?: DataTableServerSortProps;
  table: TanStackTable<TData>;
};

/**
 * Everything both tables draw, given a built TanStack table. It owns no state
 * and makes no decision about the data: the client table filters and pages in
 * memory, the server table does it through the URL, and by the time either one
 * reaches here the rows are already the rows to show.
 *
 * The four regions —toolbar, header, body, footer— are separate components
 * rather than four stretches of one return, so each can be read against the one
 * question it answers instead of against the table as a whole.
 */
export function DataTableShell<TData>({
  emptyMessage,
  filters,
  getRowProps,
  isLoading,
  pagination,
  search,
  serverSort,
  table,
}: DataTableShellProps<TData>) {
  return (
    <div className="flex flex-col gap-3">
      <DataTableToolbar filters={filters} search={search} />
      <div
        className={cn(
          "rounded-lg border bg-background transition-opacity",
          isLoading && "opacity-75",
        )}
      >
        <Table>
          <DataTableHead serverSort={serverSort} table={table} />
          <DataTableBody
            emptyMessage={emptyMessage}
            getRowProps={getRowProps}
            table={table}
          />
        </Table>
      </div>
      {!pagination.hidden ? (
        <DataTableFooter isLoading={isLoading} pagination={pagination} />
      ) : null}
    </div>
  );
}

/**
 * The search box and the faceted filters. It draws nothing at all when the
 * table has neither: a list with one page and no facets has no controls to
 * offer, and an empty bar above it would read as a broken one.
 */
function DataTableToolbar({
  filters,
  search,
}: {
  filters: DataTableFiltersProps;
  search: DataTableSearchProps;
}) {
  const hasFacetedFilters = filters.groups.length > 0;

  if (search.hidden && !hasFacetedFilters) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {!search.hidden ? <DataTableSearchField search={search} /> : null}
        {hasFacetedFilters ? (
          <TooltipProvider>
            <div className="flex flex-wrap justify-end gap-2">
              <DataTableFacetedFilterControl
                groups={filters.groups}
                selectedValues={filters.getSelectedValues(
                  dataTableFacetedFilterColumnId,
                )}
                onChange={filters.onChange}
              />
            </div>
          </TooltipProvider>
        ) : null}
      </div>
    </div>
  );
}

/** The search input, with the clear button it only grows once there is a query. */
function DataTableSearchField({ search }: { search: DataTableSearchProps }) {
  return (
    <label className="relative block sm:max-w-md sm:flex-1 lg:max-w-xl">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <span className="sr-only">Buscar en la tabla</span>
      <Input
        type="text"
        value={search.query}
        onChange={(event) => search.onChange(event.target.value)}
        placeholder={search.placeholder}
        className="pr-8 pl-8"
      />
      {search.query.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          onClick={() => search.onChange("")}
        >
          <X aria-hidden="true" data-icon />
          <span className="sr-only">Limpiar búsqueda</span>
        </Button>
      ) : null}
    </label>
  );
}

/**
 * The header rows. TanStack models headers as groups to allow stacked headers;
 * these tables have one group each, and the loop is here so that stays true by
 * construction rather than by assumption.
 */
function DataTableHead<TData>({
  serverSort,
  table,
}: {
  serverSort?: DataTableServerSortProps;
  table: TanStackTable<TData>;
}) {
  return (
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
              <DataTableHeaderContent header={header} serverSort={serverSort} />
            </TableHead>
          ))}
        </TableRow>
      ))}
    </TableHeader>
  );
}

/**
 * A header cell's content, in the three shapes it takes. A sortable column on
 * the server table sorts by link —the sort lives in the URL, so it has to be
 * navigable and shareable— and on the client table by button, where it is view
 * state. A column that cannot be sorted is neither, and renders bare.
 */
function DataTableHeaderContent<TData>({
  header,
  serverSort,
}: {
  header: Header<TData, unknown>;
  serverSort?: DataTableServerSortProps;
}) {
  const label = flexRender(header.column.columnDef.header, header.getContext());

  if (!header.column.getCanSort()) {
    return label;
  }

  if (serverSort) {
    return (
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-sm">
        <Link to={serverSort.getHref(header.column.id)}>
          {label}
          <SortIcon direction={serverSort.getDirection?.(header.column.id)} />
        </Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2 text-sm"
      onClick={header.column.getToggleSortingHandler()}
    >
      {label}
      <SortIcon direction={toSortDirection(header.column.getIsSorted())} />
    </Button>
  );
}

/** The rows, or the one cell that says why there are none. */
function DataTableBody<TData>({
  emptyMessage,
  getRowProps,
  table,
}: {
  emptyMessage: string;
  getRowProps?: (row: TData) => React.ComponentProps<"tr">;
  table: TanStackTable<TData>;
}) {
  const visibleRows = table.getRowModel().rows;

  return (
    <TableBody>
      {visibleRows.length > 0 ? (
        visibleRows.map((row) => (
          <DataTableBodyRow key={row.id} getRowProps={getRowProps} row={row} />
        ))
      ) : (
        <TableRow>
          <TableCell
            colSpan={table.getVisibleLeafColumns().length}
            className="h-24 text-center text-muted-foreground"
          >
            {emptyMessage}
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );
}

function DataTableBodyRow<TData>({
  getRowProps,
  row,
}: {
  getRowProps?: (row: TData) => React.ComponentProps<"tr">;
  row: Row<TData>;
}) {
  return (
    <TableRow {...(getRowProps?.(row.original) ?? {})}>
      {row.getVisibleCells().map((cell) => (
        <TableCell
          key={cell.id}
          className={cn(
            "px-3",
            cell.column.columnDef.meta?.className,
            cell.column.columnDef.meta?.cellClassName?.(row.original),
          )}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );
}

/**
 * How much of the set is on screen, and the way to the rest of it. The count is
 * `filtered de total` so that a narrowed list says so: the reader needs to know
 * the number they are looking at is not the whole set.
 */
function DataTableFooter({
  isLoading,
  pagination,
}: {
  isLoading: boolean;
  pagination: DataTablePaginationProps;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {pagination.filteredRowCount} de {pagination.totalRows}{" "}
        {pagination.totalRows === 1 ? "registro" : "registros"}
        {isLoading ? (
          <span className="ml-2 inline-flex items-center gap-1">
            <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
            Actualizando…
          </span>
        ) : null}
      </p>
      <DataTablePagination
        basePath={pagination.basePath}
        pageCount={pagination.pageCount}
        currentPage={pagination.currentPage}
        canPreviousPage={pagination.canPreviousPage}
        canNextPage={pagination.canNextPage}
        onPreviousPage={pagination.onPreviousPage}
        onNextPage={pagination.onNextPage}
        onPageChange={pagination.onPageChange}
        pageHrefBuilder={pagination.hrefBuilder}
      />
    </div>
  );
}
