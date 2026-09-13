import { useState } from "react";

import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { WithdrawDialog } from "@/components/shared/withdraw-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SeminarInscriptionRow } from "@/lib/seminars/inscription-rosters.server";

import { deleteSeminarInscriptionIntent } from "./shared";

/**
 * The seminar's `Inscriptos` tab: a flat table of who is registered, whichever
 * academy registered them. There is no occupancy line, no grouping and no
 * per-row menu — the only thing to do to a row is to remove it, so the name
 * itself opens the confirmation.
 */
export function SeminarInscriptionsTable({
  inscriptions,
}: {
  inscriptions: SeminarInscriptionRow[];
}) {
  const [removingInscriptionId, setRemovingInscriptionId] = useState<
    string | null
  >(null);
  const removingInscription =
    inscriptions.find(
      (inscription) => inscription.id === removingInscriptionId,
    ) ?? null;

  const columns: DataTableColumn<SeminarInscriptionRow>[] = [
    {
      id: "fullName",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (inscription) => (
        <Button
          variant="link"
          className="h-auto p-0 font-medium"
          onClick={() => setRemovingInscriptionId(inscription.id)}
        >
          {inscription.fullName}
        </Button>
      ),
      filterValue: (inscription) => inscription.fullName,
      sortValue: (inscription) => inscription.fullName,
    },
    {
      id: "personKind",
      header: "Tipo",
      cell: (inscription) => (
        <Badge variant="secondary">
          {inscription.personKind === "professor" ? "Profesor" : "Bailarín"}
        </Badge>
      ),
    },
    {
      id: "academyName",
      header: "Academia",
      className: "text-muted-foreground",
      cell: (inscription) => inscription.academyName,
      filterValue: (inscription) => inscription.academyName,
      sortValue: (inscription) => inscription.academyName,
    },
  ];

  return (
    <>
      <ClientDataTable
        rows={inscriptions}
        columns={columns}
        getRowKey={(inscription) => inscription.id}
        searchPlaceholder="Buscar inscripto por nombre o academia"
        emptyMessage="Todavía no hay inscriptos en este seminario."
        initialSort={{ columnId: "academyName", direction: "asc" }}
      />
      {removingInscription ? (
        <RemovalDialog
          inscription={removingInscription}
          onClose={() => setRemovingInscriptionId(null)}
        />
      ) : null}
    </>
  );
}

/**
 * The two confirmations of one gesture. A row holding money or a comprobante
 * line is not deleted but withdrawn, so it gets the dialog that says so: the
 * shared delete dialog's "Esta acción es irreversible." would be false of a row
 * that keeps everything it has.
 */
function RemovalDialog({
  inscription,
  onClose,
}: {
  inscription: SeminarInscriptionRow;
  onClose: () => void;
}) {
  const onOpenChange = (nextOpen: boolean) => (nextOpen ? null : onClose());

  if (inscription.hasMoney) {
    return (
      <WithdrawDialog
        confirmLabel="Retirar inscripción"
        consequence="El dinero asignado sigue en la inscripción y el lugar que tenía queda libre. Si la academia vuelve a inscribir a la persona, la inscripción se reactiva con su dinero."
        description={`Esta inscripción tiene dinero asignado o un comprobante emitido, así que no se borra: ${inscription.fullName} queda retirada del seminario.`}
        intentValue={deleteSeminarInscriptionIntent}
        onOpenChange={onOpenChange}
        open
        recordId={inscription.id}
        title={inscription.fullName}
      />
    );
  }

  return (
    <DeleteDialog
      title={inscription.fullName}
      description="Esta acción da de baja la inscripción del seminario y libera su lugar. No se puede deshacer."
      intentValue={deleteSeminarInscriptionIntent}
      recordId={inscription.id}
      open
      onOpenChange={onOpenChange}
    />
  );
}
