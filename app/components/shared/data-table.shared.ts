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

export type DataTableFacetedFilter = DataTableFacetedFilterGroup;

export type DataTableFacetedFilterGroup = {
  id: string;
  label: string;
  options: DataTableFacetedFilterOption[];
};

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

export type ClientDataTableProps<TData> = DataTableBaseProps<TData> & {
  textFilterColumnId?: string;
  selectableRows?: boolean;
  /**
   * Row selection, lifted. Pass both to control it from outside — needed when
   * the selection drives anything beyond the table, such as a header actions
   * menu or figures that re-scope to what is selected. Omit both and the table
   * keeps the selection to itself.
   */
  selectedRowIds?: string[];
  onSelectedRowIdsChange?: (selectedRowIds: string[]) => void;
  hideSearch?: boolean;
  hidePagination?: boolean;
  initialSort?: {
    columnId: string;
    direction: DataTableSortDirection;
  };
};

export type ServerDataTableProps<TData> = DataTableBaseProps<TData> & {
  currentPage: number;
  totalPages: number;
  totalRows: number;
  basePath?: string;
  initialSort?: {
    columnId: string;
    direction: DataTableSortDirection;
  };
  loading?: boolean;
};
