import type { ReactNode } from "react";

import { AdminEmptyState } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatComprobanteArcaDate,
  formatComprobanteNumber,
} from "@/lib/comprobantes/format";
import {
  comprobanteKindBadgeVariant,
  formatComprobanteKindInitials,
  formatComprobanteKindLabel,
  signedComprobanteAmount,
} from "@/lib/comprobantes/kind";
import { formatAmount } from "@/lib/finances/formatters";

import type { AnchorComprobanteRow } from "./server";

/**
 * The `Inscripciones | Comprobantes (n)` tabs of the choreography and the
 * `(seminar, academy)` financial details (#726). The page opens on the
 * inscriptions as it always did; the count on the second tab is what shows
 * that something was issued, even when nothing is left to invoice and the
 * actions menu is gone. The tabs sit inside one record, so their state stays
 * local and out of the URL.
 */
export function FinancialDetailTabs({
  comprobantes,
  inscriptions,
}: {
  comprobantes: AnchorComprobanteRow[];
  inscriptions: ReactNode;
}) {
  return (
    <Tabs defaultValue="inscriptions">
      <TabsList variant="line">
        <TabsTrigger value="inscriptions">Inscripciones</TabsTrigger>
        <TabsTrigger value="comprobantes">
          Comprobantes ({comprobantes.length})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="inscriptions" className="pt-2">
        {inscriptions}
      </TabsContent>
      <TabsContent value="comprobantes" className="pt-2">
        {comprobantes.length === 0 ? (
          <AdminEmptyState
            title="Todavía no se emitió ningún comprobante"
            description="Podés hacerlo desde el menú de acciones cuando haya algo cobrado para facturar."
          />
        ) : (
          <ClientDataTable
            rows={comprobantes}
            columns={comprobanteColumns}
            getRowKey={(row) => row.id}
            searchPlaceholder="Buscar comprobantes"
            // A unit holds an invoice and the few notes that amend it, so
            // there is nothing to search or page through.
            hideSearch
            hidePagination
            emptyMessage="No hay comprobantes para mostrar."
          />
        )}
      </TabsContent>
    </Tabs>
  );
}

// No status column: the comprobante's detail, one click away, carries it.
const comprobanteColumns: DataTableColumn<AnchorComprobanteRow>[] = [
  {
    id: "numero",
    header: "N.°",
    width: 30,
    className: "font-medium tabular-nums",
    cell: (row) => (
      <DataTableLink recordTitle to={`/administracion/comprobantes/${row.id}`}>
        {formatComprobanteNumber(row)}
      </DataTableLink>
    ),
  },
  {
    id: "tipo",
    header: "Tipo",
    width: 20,
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
    id: "fecha",
    header: "Fecha",
    width: 25,
    className: "tabular-nums",
    cell: (row) => formatComprobanteArcaDate(row.cbteFch),
  },
  {
    id: "importe",
    header: "Importe",
    width: 25,
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    // A credit note takes off what the invoice billed, so it reads negative
    // and the column reads as what the unit is invoiced for.
    cell: (row) => formatAmount(signedComprobanteAmount(row)),
  },
];
