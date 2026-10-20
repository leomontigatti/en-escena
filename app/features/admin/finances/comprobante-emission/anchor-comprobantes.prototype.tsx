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
import { Badge } from "@/components/ui/badge";
import { NOTA_CREDITO_C_CBTE_TIPO } from "@/lib/comprobantes/arca/factura-c";
import {
  comprobanteTipoBadgeVariant,
  formatComprobanteArcaDate,
  formatComprobanteNumber,
  formatComprobanteTipoInitials,
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
      <TabsList variant="line">
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
            description="Podés hacerlo desde el menú de acciones cuando haya algo cobrado para facturar."
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
  const columns: DataTableColumn<AnchorComprobanteRow>[] = [
    {
      id: "numero",
      header: "N.°",
      width: 30,
      className: "font-medium tabular-nums",
      cell: (row) => (
        <DataTableLink
          recordTitle
          to={`/administracion/comprobantes/${row.id}`}
        >
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
          variant={comprobanteTipoBadgeVariant(row.cbteTipo)}
          title={formatComprobanteTipoLabel(row.cbteTipo)}
        >
          {formatComprobanteTipoInitials(row.cbteTipo)}
        </Badge>
      ),
    },
    {
      id: "fecha",
      header: "Fecha",
      width: 25,
      cell: (row) => formatComprobanteArcaDate(row.cbteFch),
    },
    {
      id: "importe",
      header: "Importe",
      width: 25,
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      // A credit note takes money off what the anchor billed, so it reads
      // negative and the column reads as a statement.
      cell: (row) =>
        formatAmount(
          row.cbteTipo === NOTA_CREDITO_C_CBTE_TIPO
            ? -row.impTotal
            : row.impTotal,
        ),
    },
  ];

  return (
    <section aria-label="Comprobantes">
      <ClientDataTable
        rows={comprobantes}
        columns={columns}
        getRowKey={(row) => row.id}
        searchPlaceholder="Buscar por número"
        hideSearch
        hidePagination
        emptyMessage="No hay comprobantes para mostrar."
      />
    </section>
  );
}
