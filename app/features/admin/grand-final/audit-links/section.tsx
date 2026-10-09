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
import { Spinner } from "@/components/ui/spinner";
import { formatBusinessDate } from "@/lib/shared/business-time-zone";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { GrandFinalListActionData } from "../list/shared";
import { revokeAuditLinkIntent, type AuditLinkListRow } from "./shared";

/**
 * The event's `auditLink`s, the first created first: who each was handed to,
 * whether a device opened it, and a revoke with a confirmation. A revoked
 * link keeps its row and its button, which opens why it cannot run. Revoking
 * stays on the list, which revalidates; its answer is a toast.
 */
export function AuditLinksSection({ links }: { links: AuditLinkListRow[] }) {
  const fetcher = useFetcher<GrandFinalListActionData>();
  const [linkToRevoke, setLinkToRevoke] = useState<AuditLinkListRow | null>(
    null,
  );
  const [blocked, setBlocked] = useState<AuditLinkListRow | null>(null);
  const isRevoking = fetcher.state !== "idle";
  const revokingId = isRevoking ? fetcher.formData?.get("linkId") : null;

  useServerActionToast(fetcher.data);

  const columns: DataTableColumn<AuditLinkListRow>[] = [
    {
      id: "label",
      header: "Auditor",
      className: "font-medium",
      cell: (row) => row.label,
    },
    {
      id: "createdAt",
      header: "Creado",
      cell: (row) => formatBusinessDate(row.createdAt),
    },
    {
      id: "status",
      header: "Estado",
      cell: (row) => <AuditLinkStatus row={row} />,
    },
    {
      id: "actions",
      header: "",
      cell: (row) => (
        <div className="flex justify-end">
          <Button
            disabled={isRevoking}
            onClick={() =>
              row.blockReasons.length > 0
                ? setBlocked(row)
                : setLinkToRevoke(row)
            }
            variant="outline"
          >
            {revokingId === row.id ? (
              <>
                <Spinner aria-hidden="true" data-icon="inline-start" />
                Revocando
              </>
            ) : (
              "Revocar"
            )}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <section
      aria-labelledby="gran-final-auditoria"
      className="flex flex-col gap-3"
    >
      <h3 id="gran-final-auditoria" className="text-base font-semibold">
        Accesos de auditoría
      </h3>
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no creaste accesos de auditoría. Creá uno por auditor desde
          Acciones.
        </p>
      ) : (
        <ClientDataTable<AuditLinkListRow>
          columns={columns}
          emptyMessage="Todavía no creaste accesos de auditoría."
          getRowKey={(row) => row.id}
          hidePagination
          hideSearch
          rows={links}
          searchPlaceholder="Buscar auditor"
        />
      )}
      <ConfirmationDialog
        confirmLabel="Revocar"
        description="Deja de mostrar los totales en el dispositivo donde se abrió, en su próxima recarga. No se puede deshacer: para darle acceso otra vez, creá uno nuevo."
        destructive
        onConfirm={() => {
          if (linkToRevoke) {
            void fetcher.submit(
              { intent: revokeAuditLinkIntent, linkId: linkToRevoke.id },
              { method: "post" },
            );
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setLinkToRevoke(null);
          }
        }}
        open={linkToRevoke !== null}
        title={
          linkToRevoke
            ? `¿Revocar el acceso de ${linkToRevoke.label}?`
            : "¿Revocar?"
        }
      />
      <BlockedActionDialog
        description="Solo se revoca un acceso vigente."
        onOpenChange={(open) => {
          if (!open) {
            setBlocked(null);
          }
        }}
        open={blocked !== null}
        reasons={blocked?.blockReasons.map((reason) => reason.label).join(" ")}
        reasonsTitle="Motivo"
        title={
          blocked ? `No se puede revocar el acceso de ${blocked.label}` : ""
        }
      />
    </section>
  );
}

function AuditLinkStatus({ row }: { row: AuditLinkListRow }) {
  if (row.revokedAt) {
    return <Badge variant="destructive">Revocado</Badge>;
  }

  if (row.boundAt) {
    return (
      <Badge variant="success">
        Abierto el {formatBusinessDate(row.boundAt)}
      </Badge>
    );
  }

  return <Badge variant="secondary">Sin abrir</Badge>;
}
