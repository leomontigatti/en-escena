import type { ReactNode } from "react";

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
  filterValue?: (row: TData) => string;
  filterValues?: (row: TData) => string[];
  sortValue?: (row: TData) => DataTableSortValue;
};

export type DataTableFacetedFilter = {
  columnId: string;
  label: string;
  groups: DataTableFacetedFilterGroup[];
};

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
