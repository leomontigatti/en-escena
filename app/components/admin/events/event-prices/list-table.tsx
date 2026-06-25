import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { buildPriceDetailPath } from "@/lib/admin/events/event-bases-navigation";
import { groupTypeOptions } from "@/lib/events/group-types";
import type { PriceListItem } from "@/lib/events/bases.server";

import {
  formatAmount,
  formatPaymentDeadlineForTable,
  getGroupTypeLabel,
  getPriceDisplayName,
  getPriceName,
} from "./shared";

export function PriceListTable({
  prices,
  selectedEventId,
}: {
  prices: PriceListItem[];
  selectedEventId: string | null;
}) {
  const columns: DataTableColumn<PriceListItem>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (price) => (
        <DataTableLink
          to={buildPriceDetailPath(price.id, selectedEventId)}
          aria-label={getPriceDisplayName(price)}
        >
          {getPriceName(price)}
        </DataTableLink>
      ),
      filterValue: getPriceName,
    },
    {
      id: "groupType",
      header: "Tipo de grupo",
      cell: (price) => (
        <Badge variant="secondary">{getGroupTypeLabel(price.groupType)}</Badge>
      ),
      filterValues: (price) => [price.groupType],
      filterValue: (price) => getGroupTypeLabel(price.groupType),
    },
    {
      id: "filters",
      header: "Filtros",
      cell: () => null,
      hidden: true,
      filterValues: (price) => [price.groupType, price.schedule ? "yes" : "no"],
    },
    {
      id: "paymentDeadline",
      header: "Fecha límite",
      cell: (price) => (
        <span className="text-muted-foreground">
          {formatPaymentDeadlineForTable(price.paymentDeadline)}
        </span>
      ),
      sortValue: (price) => price.paymentDeadline,
    },
    {
      id: "amount",
      header: "Importe",
      cell: (price) => formatAmount(price.amount),
    },
  ];

  return (
    <DataTable
      mode="client"
      rows={prices}
      columns={columns}
      getRowKey={(price) => price.id}
      searchPlaceholder="Buscar precio por nombre"
      textFilterColumnId="name"
      facetedFilters={[
        {
          columnId: "filters",
          label: "Filtros",
          groups: [
            {
              label: "Tipo de grupo",
              options: groupTypeOptions,
            },
            {
              label: "Cronograma",
              options: [
                { label: "Sí", value: "yes" },
                { label: "No", value: "no" },
              ],
            },
          ],
        },
      ]}
      emptyMessage="No hay precios que coincidan con la búsqueda."
      initialSort={{ columnId: "paymentDeadline", direction: "asc" }}
    />
  );
}
