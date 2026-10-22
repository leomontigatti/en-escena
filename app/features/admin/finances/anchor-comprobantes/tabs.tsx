import type { ReactNode } from "react";

import { AdminEmptyState } from "@/components/admin/resource-layout";
import { ComprobantesTable } from "@/components/shared/comprobantes-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
          <ComprobantesTable rows={comprobantes} />
        )}
      </TabsContent>
    </Tabs>
  );
}
