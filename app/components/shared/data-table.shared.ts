import type { ComponentProps, ReactNode } from "react";

/**
 * The shared query-parameter contract for both tables: Spanish names, so a URL
 * a reader shares or bookmarks reads like the rest of the product. Views only
 * pass the override props when they need a different name.
 */
export const dataTablePageParamName = "pagina";
export const dataTableSearchParamName = "busqueda";
export const dataTableSortParamName = "orden";

/**
 * How long both tables wait before writing a search to the address bar. Long
 * enough that a reader still typing writes nothing, short enough that the
 * address bar settles as soon as they stop.
 */
export const dataTableSearchDebounceMs = 300;

export type DataTableSortDirection = "asc" | "desc";

export type DataTableSort = {
  columnId: string;
  direction: DataTableSortDirection;
};

export type DataTableSortValue =
  | string
  | number
  | Date
  | boolean
  | null
  | undefined;

/**
 * How a table sizes its columns.
 *
 * `auto` is the browser's own algorithm: a column takes whatever its widest row
 * needs and the container scrolls sideways when the row does not fit. It is the
 * right default for a list whose columns each ask for their own width, and it
 * is what every table here did before `fit` existed.
 *
 * `fit` makes the declared column widths authoritative, so the table can never
 * be wider than the space it was given and the horizontal scrollbar cannot
 * appear. The cost is that a cell which runs long has to be cut instead of
 * widening its column, which is why a `fit` table has to give every column a
 * `width` and say what its long cells do — see `DataTableTruncatedText`.
 */
export type DataTableLayout = "auto" | "fit";

export type DataTableColumn<TData> = {
  id: string;
  header: string;
  cell: (row: TData) => ReactNode;
  hidden?: boolean;
  className?: string;
  headerClassName?: string;
  cellClassName?: (row: TData) => string | undefined;
  /**
   * The column's share of the row, read only by a `fit` table and ignored by an
   * `auto` one.
   *
   * It is a weight and not a percentage: the table divides each column by the
   * total, so `7/23/23/18/19/10` and `1/3/3/2/3/1` both describe a row, and
   * widening one column does not mean finding the width back somewhere else.
   * Nothing has to add up to 100, which is the point — the selection checkbox
   * is a fixed column the view never declares, and a budget that had to total
   * 100% would silently overflow the row by exactly its width.
   */
  width?: number;
  filterValue?: (row: TData) => string;
  filterValues?: (row: TData) => string[];
  sortValue?: (row: TData) => DataTableSortValue;
};

export const dataTableFacetedFilterColumnId = "filters";

/**
 * The selection checkbox column, which the table adds rather than the view. A
 * `fit` table takes its width out of the row before sharing the rest, so it is
 * named here for both sides to agree on.
 */
export const dataTableSelectionColumnId = "select";

/** What the selection column takes, wide enough for the checkbox and no wider. */
export const dataTableSelectionColumnWidth = "2.5rem";

export type DataTableFacetedFilter<TId extends string = string> =
  DataTableFacetedFilterGroup<TId>;

export type DataTableFacetedFilterGroup<TId extends string = string> = {
  id: TId;
  label: string;
  options: DataTableFacetedFilterOption[];
};

/**
 * The faceted filter groups of a view whose parameter names its route has to
 * declare for the revalidation rule. The view exports its group ids as a
 * `const` list and types its groups with this, so a group can only carry an id
 * the route already names and the two cannot drift apart.
 */
export type DataTableFacetedFiltersOf<TIds extends readonly string[]> =
  DataTableFacetedFilter<TIds[number]>[];

export type DataTableFacetedFilterOption = {
  label: string;
  value: string;
};

export type DataTableFacetedFilterValue = Record<string, string>;

export type DataTableBaseProps<TData> = {
  rows: TData[];
  columns: DataTableColumn<TData>[];
  getRowKey: (row: TData) => string;
  getRowProps?: (row: TData) => ComponentProps<"tr">;
  /** Defaults to `auto`. See `DataTableLayout`. */
  layout?: DataTableLayout;
  searchPlaceholder: string;
  initialSearchValue?: string;
  facetedFilters?: DataTableFacetedFilter[];
  emptyMessage?: string;
  baseFacetedFilterValues?: Record<string, DataTableFacetedFilterValue>;
  initialFacetedFilterValues?: Record<string, DataTableFacetedFilterValue>;
  pageParamName?: string;
  searchParamName?: string;
  sortParamName?: string;
};

/**
 * Row selection, shared by both tables because both ask the same thing of it.
 * On the server table the checkbox reaches the current page only: the rows are
 * the ones the loader sent, and there is nothing else on the client to select.
 */
export type DataTableRowSelectionProps = {
  selectableRows?: boolean;
  /**
   * Row selection, lifted. Pass both to control it from outside — needed when
   * the selection drives anything beyond the table, such as a header actions
   * menu or figures that re-scope to what is selected. Omit both and the table
   * keeps the selection to itself.
   */
  selectedRowIds?: string[];
  onSelectedRowIdsChange?: (selectedRowIds: string[]) => void;
};

/**
 * What a client list pages at unless it says otherwise. Ten keeps a short list
 * short; a list that is read as a whole —or acted on as a whole, through a
 * selection— asks for more.
 */
export const defaultClientDataTablePageSize = 10;

export type ClientDataTableProps<TData> = DataTableBaseProps<TData> &
  DataTableRowSelectionProps & {
    textFilterColumnId?: string;
    hideSearch?: boolean;
    hidePagination?: boolean;
    /**
     * Rows per page, defaulting to `defaultClientDataTablePageSize`. Raise it on
     * a list whose whole set is worth reading at once: the rows are already all
     * here, so paging them is a reading choice and not a cost.
     */
    pageSize?: number;
    initialSort?: DataTableSort;
  };

export type ServerDataTableProps<TData> = DataTableBaseProps<TData> &
  DataTableRowSelectionProps & {
    currentPage: number;
    totalPages: number;
    totalRows: number;
    basePath?: string;
    initialSort?: DataTableSort;
    loading?: boolean;
  };
