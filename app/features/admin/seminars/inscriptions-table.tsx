import { useState } from "react";

import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SeminarInscriptionRow } from "@/lib/seminars/inscriptions.server";

import { deleteSeminarInscriptionIntent } from "./shared";

/**
 * The seminar's `Inscriptos` tab: a flat table of who is registered, whichever
 * academy registered them. There is no occupancy line, no grouping and no
 * per-row menu — the only thing to do to a row is to remove it, so the name
 * itself opens the confirmation.
 */
export function SeminarInscriptionsTable({
  inscriptions,
  initialRemovingInscriptionId = null,
}: {
  inscriptions: SeminarInscriptionRow[];
  initialRemovingInscriptionId?: string | null;
}) {
  const [removingInscriptionId, setRemovingInscriptionId] = useState<
    string | null
  >(initialRemovingInscriptionId);
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
        <DeleteDialog
          title={removingInscription.fullName}
          description="Esta acción da de baja la inscripción del seminario y libera su lugar. No se puede deshacer."
          intentValue={deleteSeminarInscriptionIntent}
          recordId={removingInscription.id}
          open
          onOpenChange={(nextOpen) =>
            nextOpen ? null : setRemovingInscriptionId(null)
          }
        />
      ) : null}
    </>
  );
}
