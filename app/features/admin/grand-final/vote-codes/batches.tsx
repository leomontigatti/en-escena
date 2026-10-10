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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatLongBusinessDate } from "@/lib/shared/business-time-zone";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { GrandFinalListActionData } from "../list/shared";
import {
  buildVoteCodeSheetPath,
  voidVoteCodeBatchIntent,
  type VoteCodeBatchListRow,
} from "./shared";

/**
 * The event's `voteCode` batches, the latest first, under their own tab of the
 * list, which shows it only once there is one. A batch's name opens it, with
 * its print sheet, which opens in a new tab, and its void, which asks first;
 * a voided batch's name opens why it can do neither. Voiding stays on the
 * list, which revalidates; its answer is a toast.
 */
export function VoteCodeBatchesSection({
  batches,
}: {
  batches: VoteCodeBatchListRow[];
}) {
  const fetcher = useFetcher<GrandFinalListActionData>();
  const [openBatch, setOpenBatch] = useState<VoteCodeBatchListRow | null>(null);
  const [batchToVoid, setBatchToVoid] = useState<VoteCodeBatchListRow | null>(
    null,
  );
  const [blocked, setBlocked] = useState<VoteCodeBatchListRow | null>(null);

  useServerActionToast(fetcher.data);

  const columns: DataTableColumn<VoteCodeBatchListRow>[] = [
    {
      id: "number",
      header: "Lote",
      className: "font-medium",
      cell: (row) => (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 font-medium"
          onClick={() =>
            row.blockReasons.length > 0 ? setBlocked(row) : setOpenBatch(row)
          }
        >
          {`Lote ${row.number}`}
        </Button>
      ),
    },
    { id: "codes", header: "Códigos", cell: (row) => row.codeCount },
    {
      id: "issuedAt",
      header: "Emitido",
      className: "text-muted-foreground",
      cell: (row) => formatLongBusinessDate(row.issuedAt),
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
  ];

  return (
    <>
      <ClientDataTable<VoteCodeBatchListRow>
        columns={columns}
        emptyMessage="Todavía no generaste códigos QR."
        getRowKey={(row) => row.id}
        hidePagination
        hideSearch
        rows={batches}
        searchPlaceholder="Buscar lote"
      />
      <Dialog
        open={openBatch !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenBatch(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{`Lote ${openBatch?.number ?? ""}`}</DialogTitle>
            <DialogDescription>
              {openBatch
                ? `${openBatch.codeCount} códigos QR, emitidos el ${formatLongBusinessDate(openBatch.issuedAt)}. La hoja se abre en una pestaña nueva, lista para imprimir.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setBatchToVoid(openBatch);
                setOpenBatch(null);
              }}
            >
              Anular
            </Button>
            {openBatch ? (
              <Button asChild>
                <a
                  href={buildVoteCodeSheetPath(openBatch.id)}
                  rel="noreferrer"
                  target="_blank"
                >
                  Imprimir
                </a>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        description="Solo se imprime o se anula un lote vigente. Generá un lote nuevo para imprimir códigos QR."
        onOpenChange={(open) => {
          if (!open) {
            setBlocked(null);
          }
        }}
        open={blocked !== null}
        reasons={
          <ul className="list-disc pl-5">
            {blocked?.blockReasons.map((reason) => (
              <li key={reason.code}>{reason.label}</li>
            ))}
          </ul>
        }
        reasonsTitle="Motivo"
        title={
          blocked
            ? `No se puede imprimir ni anular el lote ${blocked.number}`
            : ""
        }
      />
    </>
  );
}
