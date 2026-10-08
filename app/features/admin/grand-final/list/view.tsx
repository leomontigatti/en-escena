import { Check, Crown } from "lucide-react";
import { useCallback, useState } from "react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { BlockedActionDialog } from "@/components/shared/blocked-action-dialog";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type {
  GrandFinalAcademyRow,
  GrandFinalJudge,
  GrandFinalModalityRow,
  GrandFinalPicks,
} from "@/lib/grand-final/picks-overview.server";

import { buildFinalistBannersPath } from "../banners/shared";
import { VoteCodeBatchesSection } from "../vote-codes/batches";
import { GenerateVoteCodeBatchDialog } from "../vote-codes/generate-dialog";
import {
  VotingRoundDialogs,
  type VotingRoundAction,
} from "../voting-round/dialogs";
import type { VotingRoundListState } from "../voting-round/shared";
import { FinalistPickChangeDialog } from "./pick-dialog";
import type {
  FinalistPickChangeBlockReason,
  GrandFinalListResult,
} from "./shared";

/**
 * Administration's `Gran final` list for the active event: one table per
 * modality, an academy per row and a judge per column, so each judge's
 * `finalistPick` reads as a check in the academy's row, and each finalist's
 * banners as a status beside its name, and below them the event's QR code
 * batches. The `Acciones` menu holds the change of any judge's pick, with no
 * window, the generation of a batch, and the opening and closing of the
 * `votingRound`, whose state reads beside the title.
 */
export function GrandFinalListView({
  loaderData,
}: {
  loaderData: GrandFinalListResult;
}) {
  const [isPickDialogOpen, setIsPickDialogOpen] = useState(false);
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [votingRoundAction, setVotingRoundAction] =
    useState<VotingRoundAction | null>(null);
  const closeVotingRoundDialog = useCallback(
    () => setVotingRoundAction(null),
    [],
  );
  const { picks, votingRound } = loaderData;

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
            <DropdownMenuItem onSelect={() => setIsGenerateDialogOpen(true)}>
              Generar códigos QR
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setVotingRoundAction("open")}>
              Abrir votación
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setVotingRoundAction("close")}>
              Cerrar votación
            </DropdownMenuItem>
          </ResourceActionsMenu>
        ) : null
      }
      titleBadge={
        votingRound ? <VotingRoundBadge state={votingRound} /> : undefined
      }
    >
      {picks ? (
        <div className="flex flex-col gap-8">
          <GrandFinalModalities picks={picks} />
          <VoteCodeBatchesSection batches={loaderData.voteCodeBatches} />
        </div>
      ) : null}
      {picks ? (
        <PickDialog
          blockReasons={loaderData.pickChangeBlockReasons}
          onOpenChange={setIsPickDialogOpen}
          open={isPickDialogOpen}
          picks={picks}
        />
      ) : null}
      {isGenerateDialogOpen ? (
        <GenerateVoteCodeBatchDialog onOpenChange={setIsGenerateDialogOpen} />
      ) : null}
      {picks && votingRound ? (
        <VotingRoundDialogs
          action={votingRoundAction}
          onClose={closeVotingRoundDialog}
          state={votingRound}
        />
      ) : null}
    </AdminResourceLayout>
  );
}

/** The round's state, in the words of CONTEXT.md `votingRound`. */
function VotingRoundBadge({ state }: { state: VotingRoundListState }) {
  if (state.status === "open") {
    return <Badge variant="success">Votación abierta</Badge>;
  }

  if (state.status === "closed") {
    return <Badge variant="secondary">Votación cerrada</Badge>;
  }

  return null;
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
    {
      id: "banners",
      header: "Banners",
      cell: (row) => (row.finalist ? <BannerStatus row={row} /> : "—"),
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
 * being eligible. A finalist's name opens its banner form.
 */
function AcademyCell({ row }: { row: GrandFinalAcademyRow }) {
  return (
    <div className="flex items-center gap-2">
      {row.finalist ? (
        <DataTableLink to={buildFinalistBannersPath(row.academyId)} recordTitle>
          {row.name}
        </DataTableLink>
      ) : (
        row.name
      )}
      {row.finalist ? <Badge variant="success">Finalista</Badge> : null}
      {row.eligible ? null : (
        <Badge variant="warning">No cumple los requisitos</Badge>
      )}
    </div>
  );
}

/** Whether the finalist has the two banners the vote page shows. */
function BannerStatus({ row }: { row: GrandFinalAcademyRow }) {
  if (row.bannerCount >= 2) {
    return <Badge variant="success">Cargados</Badge>;
  }

  return (
    <Badge variant="warning">
      {row.bannerCount === 1 ? "Falta 1" : "Sin banners"}
    </Badge>
  );
}

/**
 * The change of a pick, or, when the loader found it cannot run, the
 * acknowledgment that lists why.
 */
function PickDialog({
  blockReasons,
  onOpenChange,
  open,
  picks,
}: {
  blockReasons: FinalistPickChangeBlockReason[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  picks: GrandFinalPicks;
}) {
  if (blockReasons.length > 0) {
    return (
      <BlockedActionDialog
        description="Hace falta un juez del evento y una academia que cumpla los requisitos."
        onOpenChange={onOpenChange}
        open={open}
        reasons={
          <ul className="list-disc pl-5">
            {blockReasons.map((reason) => (
              <li key={reason.code}>{reason.label}</li>
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
