// PROTOTYPE (#726), throwaway: the `Inscripciones | Comprobantes (n)` tabs of
// the two financial details. The tab count is the evidence that something was
// issued; the default tab keeps the page as it was. Not production code.
import type { ReactNode } from "react";

import { AdminEmptyState } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAmount } from "@/lib/finances/formatters";
import {
  formatComprobanteArcaDate,
  formatComprobanteNumber,
  formatComprobanteTipoLabel,
} from "@/lib/comprobantes/format";

import type { AnchorComprobanteRow } from "./anchor-comprobantes.prototype.server";

export function FinancialDetailTabsPrototype({
  comprobantes,
  inscriptions,
}: {
  comprobantes: AnchorComprobanteRow[];
  inscriptions: ReactNode;
}) {
  return (
    <Tabs defaultValue="inscriptions">
      <TabsList>
        <TabsTrigger value="inscriptions">Inscripciones</TabsTrigger>
        <TabsTrigger value="comprobantes">
          Comprobantes ({comprobantes.length})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="inscriptions">{inscriptions}</TabsContent>
      <TabsContent value="comprobantes">
        {comprobantes.length === 0 ? (
          <AdminEmptyState
            title="Todavía no se emitió ningún comprobante"
            description="Emitilo desde Acciones → Emitir factura cuando haya algo cobrado para facturar."
          />
        ) : (
          <ComprobantesTable comprobantes={comprobantes} />
        )}
      </TabsContent>
    </Tabs>
  );
}

function ComprobantesTable({
  comprobantes,
}: {
  comprobantes: AnchorComprobanteRow[];
}) {
  const numbersById = new Map(
    comprobantes.map((row) => [row.id, formatComprobanteNumber(row)]),
  );
  const columns: DataTableColumn<AnchorComprobanteRow>[] = [
    {
      id: "numero",
      header: "Comprobante",
      width: 20,
      className: "font-medium tabular-nums",
      cell: (row) => (
        <DataTableLink
          recordTitle
          to={`/administracion/comprobantes/${row.id}`}
        >
          {formatComprobanteNumber(row)}
        </DataTableLink>
      ),
      filterValue: (row) => formatComprobanteNumber(row),
    },
    {
      id: "tipo",
      header: "Tipo",
      width: 20,
      cell: (row) => formatComprobanteTipoLabel(row.cbteTipo),
    },
    {
      id: "asociado",
      header: "Corrige a",
      width: 20,
      className: "tabular-nums",
      cell: (row) =>
        row.associatedComprobanteId === null
          ? "—"
          : (numbersById.get(row.associatedComprobanteId) ?? "—"),
    },
    {
      id: "fecha",
      header: "Fecha",
      width: 20,
      cell: (row) => formatComprobanteArcaDate(row.cbteFch),
    },
    {
      id: "importe",
      header: "Importe",
      width: 20,
      className: "text-right tabular-nums",
      cell: (row) => formatAmount(row.impTotal),
    },
  ];

  return (
    <section aria-label="Comprobantes">
      <ClientDataTable
        rows={comprobantes}
        columns={columns}
        getRowKey={(row) => row.id}
        searchPlaceholder="Buscar por número"
        textFilterColumnId="numero"
        emptyMessage="No hay comprobantes para mostrar."
      />
    </section>
  );
}
