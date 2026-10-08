import { useState } from "react";
import { useFetcher } from "react-router";

import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VoteCodeBatchRow } from "@/lib/grand-final/vote-codes.server";
import { formatBusinessDate } from "@/lib/shared/business-time-zone";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { GrandFinalListActionData } from "../list/shared";
import { buildVoteCodeSheetPath, voidVoteCodeBatchIntent } from "./shared";

/**
 * The event's `voteCode` batches, the latest first: each prints in a new tab
 * while it is valid, and voids with a confirmation. Voiding stays on the list,
 * which revalidates; its answer is a toast.
 */
export function VoteCodeBatchesSection({
  batches,
}: {
  batches: VoteCodeBatchRow[];
}) {
  const fetcher = useFetcher<GrandFinalListActionData>();
  const [batchToVoid, setBatchToVoid] = useState<VoteCodeBatchRow | null>(null);
  const isVoiding = fetcher.state !== "idle";

  useServerActionToast(fetcher.data);

  const columns: DataTableColumn<VoteCodeBatchRow>[] = [
    {
      id: "number",
      header: "Lote",
      className: "font-medium",
      cell: (row) => `Lote ${row.number}`,
    },
    { id: "codes", header: "Códigos", cell: (row) => row.codeCount },
    {
      id: "issuedAt",
      header: "Emitido",
      cell: (row) => formatBusinessDate(row.issuedAt),
    },
    {
      id: "status",
      header: "Estado",
      cell: (row) =>
        row.voidedAt ? (
          <Badge variant="destructive">Anulado</Badge>
        ) : (
          <Badge variant="success">Vigente</Badge>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: (row) =>
        row.voidedAt ? null : (
          <div className="flex justify-end gap-2">
            <Button asChild size="sm" variant="outline">
              <a
                href={buildVoteCodeSheetPath(row.id)}
                rel="noreferrer"
                target="_blank"
              >
                Imprimir
              </a>
            </Button>
            <Button
              disabled={isVoiding}
              onClick={() => setBatchToVoid(row)}
              size="sm"
              variant="outline"
            >
              Anular
            </Button>
          </div>
        ),
    },
  ];

  return (
    <section
      aria-labelledby="gran-final-codigos-qr"
      className="flex flex-col gap-3"
    >
      <h3 id="gran-final-codigos-qr" className="text-base font-semibold">
        Códigos QR
      </h3>
      {batches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no generaste códigos QR. Generá un lote desde Acciones para
          imprimirlo.
        </p>
      ) : (
        <ClientDataTable<VoteCodeBatchRow>
          columns={columns}
          emptyMessage="Todavía no generaste códigos QR."
          getRowKey={(row) => row.id}
          hidePagination
          hideSearch
          rows={batches}
          searchPlaceholder="Buscar lote"
        />
      )}
      <ConfirmationDialog
        confirmLabel="Anular"
        description={
          batchToVoid
            ? `Sus ${batchToVoid.codeCount} códigos QR dejan de servir para votar, también los ya entregados. No se puede deshacer.`
            : ""
        }
        destructive
        onConfirm={() => {
          if (batchToVoid) {
            void fetcher.submit(
              { batchId: batchToVoid.id, intent: voidVoteCodeBatchIntent },
              { method: "post" },
            );
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setBatchToVoid(null);
          }
        }}
        open={batchToVoid !== null}
        title={
          batchToVoid ? `¿Anular el lote ${batchToVoid.number}?` : "¿Anular?"
        }
      />
    </section>
  );
}
