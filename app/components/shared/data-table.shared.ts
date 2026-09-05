import type { ComponentProps, ReactNode } from "react";

/**
 * The shared query-parameter contract for both tables: Spanish names, so a URL
 * a reader shares or bookmarks reads like the rest of the product. Views only
 * pass the override props when they need a different name.
 */
export const dataTablePageParamName = "pagina";
export const dataTableSearchParamName = "busqueda";
export const dataTableSortParamName = "orden";

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

export type DataTableColumn<TData> = {
  id: string;
  header: string;
  cell: (row: TData) => ReactNode;
  hidden?: boolean;
  className?: string;
  headerClassName?: string;
  cellClassName?: (row: TData) => string | undefined;
  filterValue?: (row: TData) => string;
  filterValues?: (row: TData) => string[];
  sortValue?: (row: TData) => DataTableSortValue;
};

export const dataTableFacetedFilterColumnId = "filters";

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
