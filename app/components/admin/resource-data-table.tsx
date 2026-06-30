import {
  ServerDataTable,
  type ServerDataTableProps,
} from "@/components/shared/data-table";

type AdminResourceDataTableProps<TData> = Omit<
  ServerDataTableProps<TData>,
  "pageParamName" | "searchParamName" | "sortParamName"
> &
  Partial<
    Pick<
      ServerDataTableProps<TData>,
      "pageParamName" | "searchParamName" | "sortParamName"
    >
  >;

export function AdminResourceDataTable<TData>({
  pageParamName = "pagina",
  searchParamName = "busqueda",
  sortParamName = "orden",
  ...props
}: AdminResourceDataTableProps<TData>) {
  return (
    <ServerDataTable
      {...props}
      pageParamName={pageParamName}
      searchParamName={searchParamName}
      sortParamName={sortParamName}
    />
  );
}
