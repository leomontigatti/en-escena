import type { ComponentProps, ReactNode } from "react";

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
  id?: string;
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
};

export type ClientDataTableProps<TData> = DataTableBaseProps<TData> & {
  textFilterColumnId?: string;
  selectableRows?: boolean;
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
  pageParamName?: string;
  searchParamName?: string;
  sortParamName?: string;
};
