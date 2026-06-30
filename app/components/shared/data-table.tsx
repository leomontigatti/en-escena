import { ClientDataTable } from "@/components/shared/client-data-table";
import { ServerDataTable } from "@/components/shared/server-data-table";
import type { DataTableProps } from "@/components/shared/data-table.shared";

export {
  buildDataTableFilterHref,
  buildDataTablePageHref,
  buildDataTableSearchHref,
  buildDataTableSortHref,
} from "@/components/shared/data-table-helpers";
export { ClientDataTable } from "@/components/shared/client-data-table";
export { ServerDataTable } from "@/components/shared/server-data-table";
export type {
  ClientDataTableProps,
  DataTableColumn,
  DataTableFacetedFilter,
  ServerDataTableProps,
} from "@/components/shared/data-table.shared";

export function DataTable<TData>(props: DataTableProps<TData>) {
  if (props.mode === "server") {
    const { mode: _mode, ...serverProps } = props;

    return <ServerDataTable {...serverProps} />;
  }

  const { mode: _mode, ...clientProps } = props;

  return <ClientDataTable {...clientProps} />;
}
