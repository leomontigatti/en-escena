import { Link } from "react-router";

import {
  AdminEmptyState,
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { BackButton } from "@/components/shared/action-buttons";
import { ComprobantesTable } from "@/components/shared/comprobantes-table";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { FinancialStatusBadge } from "@/components/shared/financial-status-badge";
import { PinnedActions } from "@/components/shared/pinned-actions";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAmount } from "@/lib/finances/formatters";
import {
  comprobanteAnchorHref,
  formatComprobanteAnchorLabel,
} from "@/lib/comprobantes/anchor-reading";
import {
  formatComprobanteArcaDate,
  formatComprobanteNumber,
} from "@/lib/comprobantes/format";
import { formatComprobanteKindLabel } from "@/lib/comprobantes/kind";

import { ComprobanteStatusBadge } from "@/components/shared/comprobante-status-badge";
import type { ComprobanteDetail, ComprobanteDetailLoaderData } from "./server";

type ComprobanteLine = ComprobanteDetail["lines"][number];

type ComprobanteDetailRouteViewProps = {
  loaderData: ComprobanteDetailLoaderData;
};

/**
 * Detail view of a comprobante (ADR-0011): it hosts the fiscal snapshot's data,
 * its lines, and the actions menu (the invoiced unit, the invoice a note
 * amends, print). An invoice also lists the notes that adjust it, which is what
 * makes its `Ajustada` badge readable (#657). It is reached by its number, on
 * the global list and on the `Comprobantes` tab of its unit's financial
 * detail. It has no destructive action: a comprobante is never annulled by
 * hand, only credited by the credit note its unit's delta owes (ADR-0014 §5).
 */
export function ComprobanteDetailRouteView({
  loaderData,
}: ComprobanteDetailRouteViewProps) {
  const comprobante = loaderData.comprobante;
  const printHref = `/administracion/comprobantes/${comprobante.id}/imprimir`;
  const association = comprobante.association;

  return (
    <AdminResourceLayout
      requireSelectedEvent={false}
      title={`Comprobante ${formatComprobanteNumber(comprobante)}`}
      titleBadge={
        comprobante.status === null ? undefined : (
          <ComprobanteStatusBadge status={comprobante.status} />
        )
      }
      description="Consultá los datos del comprobante y ejecutá sus acciones."
      headerAction={
        <ResourceActionsMenu>
          <DropdownMenuItem asChild>
            <Link
              to={comprobanteAnchorHref({
                academyId: comprobante.academyId,
                reading: comprobante.anchor,
              })}
            >
              {comprobante.anchor.kind === "choreography"
                ? "Ver la coreografía"
                : "Ver el seminario"}
            </Link>
          </DropdownMenuItem>
          {association?.role === "note" ? (
            <DropdownMenuItem asChild>
              <Link
                to={`/administracion/comprobantes/${association.factura.id}`}
              >
                Ver la factura
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <a href={printHref} target="_blank" rel="noreferrer">
              Imprimir
            </a>
          </DropdownMenuItem>
        </ResourceActionsMenu>
      }
    >
      <Tabs defaultValue="information">
        <TabsList variant="line">
          <TabsTrigger value="information">Información</TabsTrigger>
          <TabsTrigger value="lines">
            Detalle ({comprobante.lines.length})
          </TabsTrigger>
          {association?.role === "factura" ? (
            <TabsTrigger value="adjustments">
              Ajustes ({association.adjustments.length})
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="information" className="pt-2">
          <ComprobanteDetailCard comprobante={comprobante} />
        </TabsContent>
        <TabsContent value="lines" className="pt-2">
          <ClientDataTable
            rows={comprobante.lines}
            columns={lineColumns}
            getRowKey={(line) => line.id}
            searchPlaceholder="Buscar inscripciones"
            // A comprobante bills one unit's roster: a handful of rows.
            hideSearch
            hidePagination
            emptyMessage="El comprobante no tiene líneas."
          />
        </TabsContent>
        {association?.role === "factura" ? (
          <TabsContent value="adjustments" className="pt-2">
            {association.adjustments.length === 0 ? (
              <AdminEmptyState
                title="Ninguna nota ajusta esta factura"
                description="Cuando el total de la unidad cambie después de facturar, la nota de débito o de crédito que se emita va a aparecer acá."
              />
            ) : (
              <ComprobantesTable rows={association.adjustments} />
            )}
          </TabsContent>
        ) : null}
      </Tabs>
    </AdminResourceLayout>
  );
}

function ComprobanteDetailCard({
  comprobante,
}: {
  comprobante: ComprobanteDetail;
}) {
  return (
    <AdminResourceFormCard
      footer={
        <PinnedActions>
          <BackButton to="/administracion/comprobantes" />
        </PinnedActions>
      }
    >
      <FieldGroup className="grid gap-5 md:grid-cols-2">
        <ReadOnlyField
          label="Tipo"
          value={formatComprobanteKindLabel(comprobante.cbteTipo)}
        />
        {comprobante.association?.role === "note" ? (
          <ReadOnlyField
            label="Comprobante asociado"
            value={`${formatComprobanteKindLabel(
              comprobante.association.factura.cbteTipo,
            )} ${formatComprobanteNumber(comprobante.association.factura)}`}
          />
        ) : null}
        <ReadOnlyField label="Academia" value={comprobante.academyName} />
        <ReadOnlyField
          label={anchorKindLabel(comprobante.anchor)}
          value={formatComprobanteAnchorLabel(comprobante.anchor)}
        />
        <ReadOnlyField label="Evento" value={comprobante.eventName} />
        <ReadOnlyField
          label="Fecha"
          value={formatComprobanteArcaDate(comprobante.cbteFch)}
        />
        <ReadOnlyField label="CAE" value={comprobante.cae} />
        {comprobante.fchServDesde && comprobante.fchServHasta ? (
          <ReadOnlyField
            label="Período de servicio"
            value={`${formatComprobanteArcaDate(
              comprobante.fchServDesde,
            )} — ${formatComprobanteArcaDate(comprobante.fchServHasta)}`}
          />
        ) : null}
        {comprobante.fchVtoPago ? (
          <ReadOnlyField
            label="Vencimiento de pago"
            value={formatComprobanteArcaDate(comprobante.fchVtoPago)}
          />
        ) : null}
        <ReadOnlyField
          label="Importe"
          value={formatAmount(comprobante.impTotal)}
        />
      </FieldGroup>
    </AdminResourceFormCard>
  );
}

function anchorKindLabel(anchor: ComprobanteDetail["anchor"]) {
  return anchor.kind === "choreography" ? "Coreografía" : "Seminario";
}

const lineColumns: DataTableColumn<ComprobanteLine>[] = [
  {
    id: "descripcion",
    header: "Descripción",
    cell: (line) => (
      <span className="flex items-center gap-2">
        {line.description}
        {/* A withdrawn inscription keeps its line: it is part of the total
            ARCA authorized (#600). */}
        {line.withdrawn ? (
          <FinancialStatusBadge status={{ kind: "withdrawn" }} />
        ) : null}
      </span>
    ),
  },
  {
    id: "importe",
    header: "Importe",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (line) => formatAmount(line.amount),
  },
];
