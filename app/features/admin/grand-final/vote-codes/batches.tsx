import { useState } from "react";
import { useFetcher } from "react-router";

import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBusinessDate } from "@/lib/shared/business-time-zone";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { GrandFinalListActionData } from "../list/shared";
import {
  buildVoteCodeSheetPath,
  voidVoteCodeBatchIntent,
  type VoteCodeBatchListRow,
} from "./shared";

type BlockedBatchAction = {
  action: "print" | "void";
  batch: VoteCodeBatchListRow;
};

/**
 * The event's `voteCode` batches, the latest first: each prints in a new tab
 * while it is valid, and voids with a confirmation. A voided batch keeps both
 * actions, which open why they cannot run. Voiding stays on the list, which
 * revalidates; its answer is a toast.
 */
export function VoteCodeBatchesSection({
  batches,
}: {
  batches: VoteCodeBatchListRow[];
}) {
  const fetcher = useFetcher<GrandFinalListActionData>();
  const [batchToVoid, setBatchToVoid] = useState<VoteCodeBatchListRow | null>(
    null,
  );
  const [blocked, setBlocked] = useState<BlockedBatchAction | null>(null);
  const isVoiding = fetcher.state !== "idle";

  useServerActionToast(fetcher.data);

  const blockedVerb = blocked?.action === "print" ? "imprimir" : "anular";
  const blockedTitle = blocked
    ? `No se puede ${blockedVerb} el lote ${blocked.batch.number}`
    : "";

  const columns: DataTableColumn<VoteCodeBatchListRow>[] = [
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
      cell: (row) => {
        const isBlocked = row.blockReasons.length > 0;

        return (
          <div className="flex justify-end gap-2">
            {isBlocked ? (
              <Button
                onClick={() => setBlocked({ action: "print", batch: row })}
                size="sm"
                variant="outline"
              >
                Imprimir
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <a
                  href={buildVoteCodeSheetPath(row.id)}
                  rel="noreferrer"
                  target="_blank"
                >
                  Imprimir
                </a>
              </Button>
            )}
            <Button
              disabled={isVoiding}
              onClick={() =>
                isBlocked
                  ? setBlocked({ action: "void", batch: row })
                  : setBatchToVoid(row)
              }
              size="sm"
              variant="outline"
            >
              Anular
            </Button>
          </div>
        );
      },
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
        <ClientDataTable<VoteCodeBatchListRow>
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
      <BlockedActionDialog
        description={
          blocked?.action === "print"
            ? "Solo se imprime un lote vigente. Generá un lote nuevo para imprimir códigos QR."
            : "Solo se anula un lote vigente."
        }
        onOpenChange={(open) => {
          if (!open) {
            setBlocked(null);
          }
        }}
        open={blocked !== null}
        reasons={
          <ul className="list-disc pl-5">
            {blocked?.batch.blockReasons.map((reason) => (
              <li key={reason.code}>{reason.label}</li>
            ))}
          </ul>
        }
        reasonsTitle="Motivo"
        title={blockedTitle}
      />
    </section>
  );
}
