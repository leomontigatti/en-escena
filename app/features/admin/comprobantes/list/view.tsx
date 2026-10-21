import { ReceiptText } from "lucide-react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  DataTableTruncatedText,
  ServerDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import type { DataTableFacetedFilterValue } from "@/components/shared/data-table.shared";
import { Badge } from "@/components/ui/badge";
import { formatAmount } from "@/lib/finances/formatters";
import {
  comprobanteAnchorHref,
  formatComprobanteAnchorLabel,
} from "@/lib/comprobantes/anchor-reading";
import type { ComprobanteStatus } from "@/lib/comprobantes/comprobante-status.server";
import {
  formatComprobanteArcaDate,
  formatComprobanteNumber,
  formatComprobanteStatusLabel,
} from "@/lib/comprobantes/format";
import {
  comprobanteKindBadgeVariant,
  comprobanteKindCbteTipo,
  comprobanteKinds,
  formatComprobanteKindInitials,
  formatComprobanteKindLabel,
} from "@/lib/comprobantes/kind";
import { describeEmptyList } from "@/lib/list-query/list-query";

import { ComprobanteStatusBadge } from "@/components/shared/comprobante-status-badge";
import type { ComprobantesListRow, ComprobantesListLoaderData } from "./server";
import {
  comprobanteAnchorKindSearchValues,
  comprobanteStatusSearchValues,
} from "./shared";

type ComprobantesListRouteViewProps = {
  loaderData: ComprobantesListLoaderData;
};

// A read-only global list, paginated/sorted/filtered on the server (ADR-0011,
// #483). Fixed column order:
// `N.° · Tipo · Academia · Origen · Estado · Fecha · Importe`.
// Only `N.°` (the number) and `Fecha` are sortable (`sortValue` enables
// the header). The number links to the comprobante detail and the anchor to its
// financial detail — the choreography's or the `(seminar, academy)` unit's;
// there is no CAE column and no inline actions (print lives in the detail).
const comprobanteColumns: DataTableColumn<ComprobantesListRow>[] = [
  {
    id: "numero",
    header: "N.°",
    width: 15,
    className: "font-medium tabular-nums",
    cell: (row) => (
      <DataTableLink recordTitle to={`/administracion/comprobantes/${row.id}`}>
        {formatComprobanteNumber(row)}
      </DataTableLink>
    ),
    sortValue: (row) => `${row.ptoVta}-${String(row.cbteNro).padStart(8, "0")}`,
  },
  {
    id: "kind",
    header: "Tipo",
    width: 6,
    cell: (row) => (
      <Badge
        variant={comprobanteKindBadgeVariant(row.cbteTipo)}
        title={formatComprobanteKindLabel(row.cbteTipo)}
      >
        {formatComprobanteKindInitials(row.cbteTipo)}
      </Badge>
    ),
  },
  {
    id: "academy",
    header: "Academia",
    width: 23,
    className: "text-muted-foreground",
    cell: (row) => <DataTableTruncatedText value={row.academyName} />,
  },
  {
    id: "anchor",
    // One column for both anchors, the comprobante's `Origen`: a choreography
    // reads as its name, a seminar as `Seminario {instructor}, {fecha}`. The
    // `Origen` facet narrows the list to one kind.
    header: "Origen",
    width: 24,
    className: "text-muted-foreground",
    cell: (row) => {
      const label = formatComprobanteAnchorLabel(row.anchor);

      return (
        <DataTableTruncatedText value={label}>
          <DataTableLink
            to={comprobanteAnchorHref({
              academyId: row.academyId,
              reading: row.anchor,
            })}
          >
            {label}
          </DataTableLink>
        </DataTableTruncatedText>
      );
    },
  },
  {
    id: "status",
    header: "Estado",
    width: 10,
    cell: (row) => <ComprobanteStatusBadge status={row.status} />,
  },
  {
    id: "fecha",
    header: "Fecha",
    width: 10,
    className: "tabular-nums",
    cell: (row) => formatComprobanteArcaDate(row.cbteFch),
    sortValue: (row) => row.cbteFch,
  },
  {
    id: "amount",
    header: "Importe",
    width: 12,
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.impTotal),
  },
];

// Only an invoice has a status; a note's row matches none of these.
const statusFacetOrder: ComprobanteStatus[] = ["valid", "adjusted", "annulled"];

const comprobanteFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "estado",
    label: "Estado",
    options: statusFacetOrder.map((status) => ({
      label: formatComprobanteStatusLabel(status),
      value: comprobanteStatusSearchValues[status],
    })),
    renderValue: (option) => (
      <ComprobanteStatusBadge
        status={
          statusFacetOrder.find(
            (status) => comprobanteStatusSearchValues[status] === option.value,
          ) ?? null
        }
      />
    ),
  },
  {
    id: "tipo",
    label: "Tipo",
    options: comprobanteKinds.map((kind) => ({
      label: formatComprobanteKindLabel(comprobanteKindCbteTipo(kind)),
      value: kind,
    })),
    // The full name and not the initials the column shows: the column has the
    // width of two letters, and here the value has room to say what it is.
    renderValue: (option) => {
      const kind = comprobanteKinds.find(
        (candidate) => candidate === option.value,
      );

      return (
        <Badge
          variant={
            kind === undefined
              ? "outline"
              : comprobanteKindBadgeVariant(comprobanteKindCbteTipo(kind))
          }
        >
          {option.label}
        </Badge>
      );
    },
  },
  {
    id: "origen",
    label: "Origen",
    options: [
      {
        label: "Coreografía",
        value: comprobanteAnchorKindSearchValues.choreography,
      },
      { label: "Seminario", value: comprobanteAnchorKindSearchValues.seminar },
    ],
  },
];

const emptyComprobantesList = describeEmptyList(
  "comprobantes",
  "search-and-filters",
);

export function ComprobantesListRouteView({
  loaderData,
}: ComprobantesListRouteViewProps) {
  // The order and the page narrow nothing: a sort reorders the same rows, and
  // a page past the last one is clamped.
  const shouldShowTable =
    loaderData.rows.length > 0 ||
    loaderData.hasAnyComprobante ||
    loaderData.filters.query.length > 0 ||
    loaderData.filters.status !== null ||
    loaderData.filters.kind !== null ||
    loaderData.filters.anchorKind !== null;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Comprobantes"
      description="Revisá los comprobantes electrónicos emitidos para el evento activo y su estado fiscal."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar comprobantes",
        description:
          "Activá un evento para consultar los comprobantes emitidos por administración.",
      }}
    >
      {shouldShowTable ? (
        <ServerDataTable
          rows={loaderData.rows}
          columns={comprobanteColumns}
          facetedFilters={comprobanteFacetedFilters}
          initialFacetedFilterValues={buildInitialFacetedFilterValues(
            loaderData,
          )}
          initialSearchValue={loaderData.filters.query}
          getRowKey={(row) => row.id}
          // Seven columns is the widest list here; sharing the row out among
          // them is what keeps it inside the page.
          layout="fit"
          searchPlaceholder="Buscar por academia o número"
          initialSort={loaderData.filters.order}
          emptyMessage={emptyComprobantesList.nothingMatched}
          currentPage={loaderData.filters.page}
          totalPages={loaderData.totalPages}
          totalRows={loaderData.totalCount}
        />
      ) : (
        <AdminEmptyState
          icon={ReceiptText}
          title={emptyComprobantesList.nothingYet}
          description="Cuando administración emita comprobantes para el evento activo, van a aparecer acá."
        />
      )}
    </AdminResourceLayout>
  );
}

function buildInitialFacetedFilterValues(
  loaderData: ComprobantesListLoaderData,
): Record<string, DataTableFacetedFilterValue> {
  const filters: DataTableFacetedFilterValue = {};

  if (loaderData.filters.status !== null) {
    filters.estado = comprobanteStatusSearchValues[loaderData.filters.status];
  }

  if (loaderData.filters.kind !== null) {
    filters.tipo = loaderData.filters.kind;
  }

  if (loaderData.filters.anchorKind !== null) {
    filters.origen =
      comprobanteAnchorKindSearchValues[loaderData.filters.anchorKind];
  }

  return {
    filters,
  };
}
