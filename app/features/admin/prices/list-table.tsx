import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { buildDetailPath } from "@/lib/shared/navigation";
import { groupTypeOptions } from "@/lib/events/group-types";
import type { PriceListItem } from "@/lib/events/bases.server";
import { describeEmptyList } from "@/lib/list-query/list-query";

import { basePath } from "./shared";
import {
  formatAmount,
  formatPaymentDeadlineForTable,
  getGroupTypeLabel,
  getPriceDisplayName,
  getPriceName,
} from "./view-shared";

const emptyPriceList = describeEmptyList("precios", "search-and-filters");

export const priceFacetedFilterIds = ["tipo-de-grupo", "cronograma"] as const;

const priceFacetedFilters: DataTableFacetedFiltersOf<
  typeof priceFacetedFilterIds
> = [
  {
    id: "tipo-de-grupo",
    label: "Tipo de grupo",
    options: groupTypeOptions,
  },
  {
    id: "cronograma",
    label: "Cronograma",
    options: [
      { label: "Sí", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
];

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
          to={buildDetailPath(basePath, price.id, selectedEventId)}
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
      filterValues: (price) => [
        price.groupType,
        price.schedules.length > 0 ? "yes" : "no",
      ],
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
    <ClientDataTable
      rows={prices}
      columns={columns}
      getRowKey={(price) => price.id}
      searchPlaceholder="Buscar precio por nombre"
      textFilterColumnId="name"
      facetedFilters={priceFacetedFilters}
      emptyMessage={emptyPriceList.nothingMatched}
      initialSort={{ columnId: "paymentDeadline", direction: "asc" }}
    />
  );
}
