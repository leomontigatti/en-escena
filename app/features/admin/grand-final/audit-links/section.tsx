import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { formatLongBusinessDate } from "@/lib/shared/business-time-zone";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { GrandFinalListActionData } from "../list/shared";
import { AuditLinkHandover } from "./create-dialog";
import {
  revokeAuditLinkIntent,
  showAuditLinkIntent,
  type AuditLinkListRow,
} from "./shared";

/**
 * The event's `auditLink`s, the first created first, under their own tab of
 * the list, which shows it only once there is one: who each was handed to,
 * whether a device opened it, and its state. The auditor's name opens the
 * link again, with its QR and its address, and with the revoke, which asks
 * first; a revoked link's name, or a spent one's once its round closed,
 * opens why it cannot. Revoking stays on the
 * list, which revalidates; its answer is a toast.
 */
export function AuditLinksSection({ links }: { links: AuditLinkListRow[] }) {
  const [shownLink, setShownLink] = useState<AuditLinkListRow | null>(null);
  const [blocked, setBlocked] = useState<AuditLinkListRow | null>(null);

  const columns: DataTableColumn<AuditLinkListRow>[] = [
    {
      id: "label",
      header: "Auditor",
      className: "font-medium",
      cell: (row) => (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 font-medium"
          onClick={() =>
            row.blockReasons.length > 0 ? setBlocked(row) : setShownLink(row)
          }
        >
          {row.label}
        </Button>
      ),
    },
    {
      id: "createdAt",
      header: "Creado",
      className: "text-muted-foreground",
      cell: (row) => formatLongBusinessDate(row.createdAt),
    },
    {
      id: "status",
      header: "Estado",
      cell: (row) => <AuditLinkStatus row={row} />,
    },
  ];

  return (
    <>
      <ClientDataTable<AuditLinkListRow>
        columns={columns}
        emptyMessage="Todavía no creaste accesos de auditoría."
        getRowKey={(row) => row.id}
        hidePagination
        hideSearch
        rows={links}
        searchPlaceholder="Buscar auditor"
      />
      {shownLink ? (
        <ShownAuditLinkDialog
          link={shownLink}
          onClose={() => setShownLink(null)}
        />
      ) : null}
      <BlockedActionDialog
        description="Solo se abre un acceso vigente, mientras dura la votación que muestra. Para darle acceso otra vez, creá uno nuevo."
        onOpenChange={(open) => {
          if (!open) {
            setBlocked(null);
          }
        }}
        open={blocked !== null}
        reasons={blocked?.blockReasons.map((reason) => reason.label).join(" ")}
        reasonsTitle="Motivo"
        title={blocked ? `No se puede abrir el acceso de ${blocked.label}` : ""}
      />
    </>
  );
}

/**
 * A live link handed over again: the server derives its address for this
 * answer only. Its revoke asks first, and closes the dialog with it.
 */
function ShownAuditLinkDialog({
  link,
  onClose,
}: {
  link: AuditLinkListRow;
  onClose: () => void;
}) {
  const showFetcher = useFetcher<GrandFinalListActionData>();
  const revokeFetcher = useFetcher<GrandFinalListActionData>();
  const [isConfirmingRevoke, setIsConfirmingRevoke] = useState(false);
  const shown = showFetcher.data?.auditLink;
  const { submit } = showFetcher;

  useEffect(() => {
    void submit(
      { intent: showAuditLinkIntent, linkId: link.id },
      { method: "post" },
    );
  }, [link.id, submit]);

  // A shown link says nothing on success: the dialog is the answer.
  useServerActionToast(
    showFetcher.data?.status === "error" ? showFetcher.data : undefined,
  );
  useServerActionToast(revokeFetcher.data);

  // A revoke that went through, or a link refused since the list loaded,
  // leaves nothing to show: the dialog closes over its toast.
  const isDone =
    revokeFetcher.data?.status === "success" ||
    showFetcher.data?.status === "error";
  const isRevoking = revokeFetcher.state !== "idle";

  useEffect(() => {
    if (isDone) {
      onClose();
    }
  }, [isDone, onClose]);

  return (
    <>
      <Dialog
        open={!isConfirmingRevoke}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
      >
        <DialogContent>
          {shown ? (
            <AuditLinkHandover
              action={
                <Button
                  type="button"
                  variant="outline"
                  disabled={isRevoking}
                  onClick={() => setIsConfirmingRevoke(true)}
                >
                  {isRevoking ? (
                    <Spinner aria-hidden="true" data-icon="inline-start" />
                  ) : null}
                  Revocar
                </Button>
              }
              link={shown}
              onDone={onClose}
            />
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DialogTitle className="sr-only">
                Acceso de auditoría de {link.label}
              </DialogTitle>
              <Spinner aria-hidden="true" />
              Buscando el acceso de {link.label}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        confirmLabel="Revocar"
        description="Deja de mostrar los totales en todos los dispositivos donde se abrió, en su próxima recarga. No se puede deshacer: para darle acceso otra vez, creá uno nuevo."
        destructive
        onConfirm={() => {
          void revokeFetcher.submit(
            { intent: revokeAuditLinkIntent, linkId: link.id },
            { method: "post" },
          );
        }}
        onOpenChange={setIsConfirmingRevoke}
        open={isConfirmingRevoke}
        title={`¿Revocar el acceso de ${link.label}?`}
      />
    </>
  );
}

function AuditLinkStatus({ row }: { row: AuditLinkListRow }) {
  if (row.revokedAt) {
    return <Badge variant="destructive">Revocado</Badge>;
  }

  if (row.blockReasons.some((reason) => reason.code === "expired")) {
    return <Badge variant="secondary">Vencido</Badge>;
  }

  if (row.openedAt) {
    return (
      <Badge variant="success">
        Abierto el {formatLongBusinessDate(row.openedAt)}
      </Badge>
    );
  }

  return <Badge variant="secondary">Sin abrir</Badge>;
}
