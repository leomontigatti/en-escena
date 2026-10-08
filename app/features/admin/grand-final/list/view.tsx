import { Check, Crown } from "lucide-react";
import { useState } from "react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type {
  GrandFinalAcademyRow,
  GrandFinalJudge,
  GrandFinalModalityRow,
  GrandFinalPicks,
} from "@/lib/grand-final/picks-overview.server";

import { FinalistPickChangeDialog } from "./pick-dialog";
import type { GrandFinalListResult } from "./shared";

/**
 * Administration's `Gran final` list for the active event: one table per
 * modality, an academy per row and a judge per column, so each judge's
 * `finalistPick` reads as a check in the academy's row. The `Acciones` menu
 * holds the change of any judge's pick, with no window; the later actions of
 * the `grandFinal` join it.
 */
export function GrandFinalListView({
  loaderData,
}: {
  loaderData: GrandFinalListResult;
}) {
  const [isPickDialogOpen, setIsPickDialogOpen] = useState(false);
  const { picks } = loaderData;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Gran final"
      description="Revisá qué academias cumplen los requisitos en cada modalidad y cuál eligió cada juez como finalista."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para ver su Gran final",
        description:
          "Activá un evento para revisar las academias que pueden ser finalistas y la elección de cada juez.",
      }}
      headerAction={
        picks ? (
          <ResourceActionsMenu contentClassName="w-56">
            <DropdownMenuItem onSelect={() => setIsPickDialogOpen(true)}>
              Cambiar elección de finalista
            </DropdownMenuItem>
          </ResourceActionsMenu>
        ) : null
      }
    >
      {picks ? <GrandFinalModalities picks={picks} /> : null}
      {picks ? (
        <PickDialog
          onOpenChange={setIsPickDialogOpen}
          open={isPickDialogOpen}
          picks={picks}
        />
      ) : null}
    </AdminResourceLayout>
  );
}

function GrandFinalModalities({ picks }: { picks: GrandFinalPicks }) {
  if (picks.modalities.every((modality) => modality.academies.length === 0)) {
    return (
      <AdminEmptyState
        icon={Crown}
        title="Ninguna academia cumple los requisitos todavía"
        description="Una academia aparece acá en cada modalidad en la que cumple los requisitos de la Gran final."
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {picks.modalities.map((modality) => (
        <section
          key={modality.modalityId}
          aria-labelledby={`gran-final-${modality.modalityId}`}
          className="flex flex-col gap-3"
        >
          <h3
            id={`gran-final-${modality.modalityId}`}
            className="text-base font-semibold"
          >
            {modality.modalityName}
          </h3>
          <ModalityTable judges={picks.judges} modality={modality} />
        </section>
      ))}
    </div>
  );
}

function ModalityTable({
  judges,
  modality,
}: {
  judges: GrandFinalJudge[];
  modality: GrandFinalModalityRow;
}) {
  if (modality.academies.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ninguna academia cumple los requisitos en esta modalidad.
      </p>
    );
  }

  const columns: DataTableColumn<GrandFinalAcademyRow>[] = [
    {
      id: "academy",
      header: "Academia",
      className: "font-medium",
      cell: (row) => <AcademyCell row={row} />,
    },
    ...judges.map((judge): DataTableColumn<GrandFinalAcademyRow> => ({
      id: `judge-${judge.id}`,
      header: judge.name,
      cell: (row) =>
        row.pickedByJudgeIds.includes(judge.id) ? (
          <Check aria-label="Elegida" className="size-4 text-primary" />
        ) : (
          "—"
        ),
    })),
  ];

  return (
    <ClientDataTable<GrandFinalAcademyRow>
      columns={columns}
      emptyMessage="Ninguna academia cumple los requisitos en esta modalidad."
      getRowKey={(row) => row.academyId}
      hidePagination
      hideSearch
      rows={modality.academies}
      searchPlaceholder="Buscar academia"
    />
  );
}

/**
 * The academy, `Finalista` when any judge picked it in any modality, and a
 * warning when it is here only because a judge picked it before it stopped
 * being eligible.
 */
function AcademyCell({ row }: { row: GrandFinalAcademyRow }) {
  return (
    <div className="flex items-center gap-2">
      {row.name}
      {row.finalist ? <Badge variant="success">Finalista</Badge> : null}
      {row.eligible ? null : (
        <Badge variant="warning">No cumple los requisitos</Badge>
      )}
    </div>
  );
}

/**
 * The change of a pick needs a judge of the event and an academy eligible
 * somewhere; without either the menu item says what is missing instead.
 */
function PickDialog({
  onOpenChange,
  open,
  picks,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  picks: GrandFinalPicks;
}) {
  const reasons = [
    picks.judges.length === 0
      ? "El evento activo todavía no tiene jueces asignados a sus presentaciones."
      : null,
    picks.modalities.some((modality) =>
      modality.academies.some((academy) => academy.eligible),
    )
      ? null
      : "Ninguna academia cumple los requisitos en ninguna modalidad.",
  ].filter((reason) => reason !== null);

  if (reasons.length > 0) {
    return (
      <BlockedActionDialog
        description="Hace falta un juez del evento y una academia que cumpla los requisitos."
        onOpenChange={onOpenChange}
        open={open}
        reasons={
          <ul className="list-disc pl-4">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        }
        reasonsTitle="Falta"
        title="No se puede cambiar la elección de finalista"
      />
    );
  }

  return open ? (
    <FinalistPickChangeDialog onOpenChange={onOpenChange} picks={picks} />
  ) : null;
}
