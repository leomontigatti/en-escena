import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { getParticipantCellLabel } from "@/lib/seminar-prices/participant-cells";
import type { SeminarPriceListItem } from "@/lib/seminar-prices/repository.server";
import {
  seminarKindLabels,
  seminarKindOptions,
} from "@/lib/seminars/seminar-kinds";
import { buildDetailPath } from "@/lib/shared/navigation";

import {
  formatAmount,
  formatPaymentDeadlineForTable,
} from "../prices/view-shared";
import { seminarPricesBasePath } from "./shared";

export const seminarPriceFacetedFilterIds = [
  "tipo-de-seminario",
  "participantes",
] as const;

const seminarPriceFacetedFilters: DataTableFacetedFiltersOf<
  typeof seminarPriceFacetedFilterIds
> = [
  {
    id: "tipo-de-seminario",
    label: "Tipo de seminario",
    options: seminarKindOptions,
  },
  {
    id: "participantes",
    label: "Participantes",
    options: [
      { label: getParticipantCellLabel(true), value: "yes" },
      { label: getParticipantCellLabel(false), value: "no" },
    ],
  },
];

export function SeminarPriceListTable({
  seminarPrices,
  selectedEventId,
}: {
  seminarPrices: SeminarPriceListItem[];
  selectedEventId: string | null;
}) {
  const columns: DataTableColumn<SeminarPriceListItem>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (seminarPrice) => (
        <DataTableLink
          to={buildDetailPath(
            seminarPricesBasePath,
            seminarPrice.id,
            selectedEventId,
          )}
          aria-label={seminarPrice.name}
        >
          {seminarPrice.name}
        </DataTableLink>
      ),
      filterValue: (seminarPrice) => seminarPrice.name,
    },
    {
      // The kind and the participant cell read as one column: together they
      // name the list a row belongs to, and neither says much alone.
      id: "kind",
      header: "Tipo de seminario",
      cell: (seminarPrice) => (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {seminarKindLabels[seminarPrice.kind]}
          </Badge>
          <Badge variant="outline">
            {getParticipantCellLabel(seminarPrice.forParticipants)}
          </Badge>
        </div>
      ),
      filterValue: (seminarPrice) =>
        `${seminarKindLabels[seminarPrice.kind]} ${getParticipantCellLabel(
          seminarPrice.forParticipants,
        )}`,
    },
    {
      id: "filters",
      header: "Filtros",
      cell: () => null,
      hidden: true,
      filterValues: (seminarPrice) => [
        seminarPrice.kind,
        seminarPrice.forParticipants ? "yes" : "no",
      ],
    },
    {
      id: "paymentDeadline",
      header: "Fecha límite",
      cell: (seminarPrice) => (
        <span className="text-muted-foreground">
          {formatPaymentDeadlineForTable(seminarPrice.paymentDeadline)}
        </span>
      ),
      sortValue: (seminarPrice) => seminarPrice.paymentDeadline,
    },
    {
      id: "amount",
      header: "Importe",
      cell: (seminarPrice) => formatAmount(seminarPrice.amount),
    },
  ];

  return (
    <ClientDataTable
      rows={seminarPrices}
      columns={columns}
      getRowKey={(seminarPrice) => seminarPrice.id}
      searchPlaceholder="Buscar precio por nombre"
      textFilterColumnId="name"
      facetedFilters={seminarPriceFacetedFilters}
      emptyMessage="No hay precios que coincidan con la búsqueda."
      initialSort={{ columnId: "paymentDeadline", direction: "asc" }}
    />
  );
}
