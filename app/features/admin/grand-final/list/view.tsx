import { AudioLines, Crown } from "lucide-react";
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
import type { DataTableFacetedFiltersOf } from "@/components/shared/data-table.shared";
import { DataTableLink } from "@/components/shared/data-table-link";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  GrandFinalAcademyRow,
  GrandFinalPicks,
} from "@/lib/grand-final/picks-overview.server";
import {
  listQueryParamNames,
  matchesListSearch,
} from "@/lib/list-query/list-query";
import { listTabParam, useUrlTab } from "@/lib/shared/url-tab";

import { AuditLinksSection } from "../audit-links/section";
import { CreateAuditLinkDialog } from "../audit-links/create-dialog";
import type { AuditLinkCreateBlockReason } from "../audit-links/shared";
import { buildAcademyGrandFinalPath } from "../academy/shared";
import { VoteCodeBatchesSection } from "../vote-codes/batches";
import { GenerateVoteCodeBatchDialog } from "../vote-codes/generate-dialog";
import {
  VotingRoundDialogs,
  type VotingRoundAction,
} from "../voting-round/dialogs";
import { VotingRoundResultSection } from "../voting-round/result-section";
import type { VotingRoundListState } from "../voting-round/shared";
import type { GrandFinalListResult } from "./shared";

/**
 * Administration's `Gran final` list for the active event: each academy in
 * each modality it qualifies in, its name opening its judges there and, once
 * it is a `finalist`, its banners, and
 * tabs for the event's QR code batches and audit links once there is one of
 * each. The `Acciones` menu holds the generation of a batch, the creation of
 * an `auditLink`, and the
 * `votingRound`'s actions: open or close, whichever applies, the
 * `Desempate`, and publish or hide the result, whichever applies. The round's
 * state reads beside the title, and once a round closed its result heads the page.
 */
export function GrandFinalListView({
  loaderData,
}: {
  loaderData: GrandFinalListResult;
}) {
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  // Which dialog opens is decided when the item is chosen: the list
  // revalidates after a link is created, and the third one must not swap its
  // only handover for the limit's refusal.
  const [auditLinkDialog, setAuditLinkDialog] =
    useState<AuditLinkDialogKind | null>(null);
  const closeAuditLinkDialog = useCallback(() => setAuditLinkDialog(null), []);
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
      description="Revisá qué academias cumplen los requisitos en cada modalidad, cuáles son finalistas y si cargaron sus banners."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para ver su Gran final",
        description:
          "Activá un evento para revisar las academias que pueden ser finalistas y la elección de cada juez.",
      }}
      headerAction={
        picks ? (
          <GrandFinalActionsMenu
            onCreateAuditLink={() =>
              setAuditLinkDialog(
                loaderData.auditLinkCreateBlockReasons.length > 0
                  ? "blocked"
                  : "create",
              )
            }
            onGenerateVoteCodes={() => setIsGenerateDialogOpen(true)}
            onVotingRoundAction={setVotingRoundAction}
            votingRound={votingRound}
          />
        ) : null
      }
      titleBadge={
        votingRound ? <VotingRoundBadge state={votingRound} /> : undefined
      }
    >
      {picks ? (
        <div className="flex flex-col gap-8">
          {votingRound?.result ? (
            <VotingRoundResultSection result={votingRound.result} />
          ) : null}
          <GrandFinalTabs
            auditLinks={loaderData.auditLinks}
            picks={picks}
            voteCodeBatches={loaderData.voteCodeBatches}
          />
        </div>
      ) : null}
      {isGenerateDialogOpen ? (
        <GenerateVoteCodeBatchDialog onOpenChange={setIsGenerateDialogOpen} />
      ) : null}
      <AuditLinkDialog
        blockReasons={loaderData.auditLinkCreateBlockReasons}
        kind={auditLinkDialog}
        onClose={closeAuditLinkDialog}
      />
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

/**
 * The list's `Acciones`. Of open and close, and of publish and hide, it offers
 * the one that applies: opening an open vote or publishing a public result is
 * not an action to explain, it is the other one.
 */
function GrandFinalActionsMenu({
  onCreateAuditLink,
  onGenerateVoteCodes,
  onVotingRoundAction,
  votingRound,
}: {
  onCreateAuditLink: () => void;
  onGenerateVoteCodes: () => void;
  onVotingRoundAction: (action: VotingRoundAction) => void;
  votingRound: VotingRoundListState | null;
}) {
  const isVoteOpen = votingRound?.status === "open";
  const isResultPublished = votingRound?.result?.published ?? false;
  const offered: Record<VotingRoundAction, boolean> = {
    close: isVoteOpen,
    hide: isResultPublished,
    open: !isVoteOpen,
    publish: !isResultPublished,
    "tie-break": true,
  };
  const roundItems = votingRoundMenuItems.filter(
    (item) => offered[item.action],
  );
  const destructiveItems = destructiveVotingRoundMenuItems.filter(
    (item) => offered[item.action],
  );
  const renderRoundItem = (item: {
    action: VotingRoundAction;
    label: string;
  }) => (
    <DropdownMenuItem
      key={item.action}
      onSelect={() => onVotingRoundAction(item.action)}
    >
      {item.label}
    </DropdownMenuItem>
  );

  return (
    <ResourceActionsMenu contentClassName="w-56">
      <DropdownMenuItem onSelect={onGenerateVoteCodes}>
        Generar códigos QR
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onCreateAuditLink}>
        Crear acceso de auditoría
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {roundItems.map(renderRoundItem)}
      {destructiveItems.length > 0 ? <DropdownMenuSeparator /> : null}
      {destructiveItems.map(renderRoundItem)}
    </ResourceActionsMenu>
  );
}

const votingRoundMenuItems: { action: VotingRoundAction; label: string }[] = [
  { action: "open", label: "Abrir votación" },
  { action: "tie-break", label: "Abrir desempate" },
  { action: "publish", label: "Publicar resultado" },
];

/** Last and apart, after their own separator. */
const destructiveVotingRoundMenuItems: {
  action: VotingRoundAction;
  label: string;
}[] = [
  { action: "hide", label: "Ocultar resultado" },
  { action: "close", label: "Cerrar votación" },
];

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

const academiesTab = "academias";
const voteCodesTab = "codigos-qr";
const auditLinksTab = "auditoria";

/**
 * The academies, and beside them the QR code batches and the audit links once
 * there is one of each: a tab with nothing to list is not drawn.
 */
function GrandFinalTabs({
  auditLinks,
  picks,
  voteCodeBatches,
}: {
  auditLinks: GrandFinalListResult["auditLinks"];
  picks: GrandFinalPicks;
  voteCodeBatches: GrandFinalListResult["voteCodeBatches"];
}) {
  const hasBatches = voteCodeBatches.length > 0;
  const hasLinks = auditLinks.length > 0;
  const tab = useUrlTab({
    defaultValue: academiesTab,
    param: listTabParam,
    // The search and the filter are the academies'; the other tabs have
    // neither, and a stale one would come back with the academies tab.
    resets: [
      listQueryParamNames.search,
      listQueryParamNames.page,
      ...grandFinalAcademyFacetedFilterIds,
    ],
    values: [
      academiesTab,
      ...(hasBatches ? [voteCodesTab] : []),
      ...(hasLinks ? [auditLinksTab] : []),
    ],
  });

  return (
    <Tabs value={tab.value} onValueChange={tab.onValueChange}>
      <TabsList variant="line">
        <TabsTrigger value={academiesTab}>Academias</TabsTrigger>
        {hasBatches ? (
          <TabsTrigger value={voteCodesTab}>Códigos QR</TabsTrigger>
        ) : null}
        {hasLinks ? (
          <TabsTrigger value={auditLinksTab}>Accesos de auditoría</TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value={academiesTab} className="pt-2">
        <AcademiesTable picks={picks} />
      </TabsContent>
      {hasBatches ? (
        <TabsContent value={voteCodesTab} className="pt-2">
          <VoteCodeBatchesSection batches={voteCodeBatches} />
        </TabsContent>
      ) : null}
      {hasLinks ? (
        <TabsContent value={auditLinksTab} className="pt-2">
          <AuditLinksSection links={auditLinks} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

type AcademyModalityRow = GrandFinalAcademyRow & {
  modalityId: string;
  modalityName: string;
};

/** The `Academias` tab's filters, which the route declares for revalidation. */
export const grandFinalAcademyFacetedFilterIds = ["modalidad"] as const;

/**
 * Each academy once per modality it qualifies in, or was picked in before it
 * stopped qualifying, found by its name or by the name of a judge who picked
 * it there, and filtered by modality. Its name opens its page in that
 * modality, where its judges there are picked and, once it is a `finalist`,
 * its banners loaded.
 */
function AcademiesTable({ picks }: { picks: GrandFinalPicks }) {
  const judgeNames = new Map(
    picks.judges.map((judge) => [judge.id, judge.name]),
  );
  const rows = picks.modalities.flatMap((modality) =>
    modality.academies.map((academy): AcademyModalityRow => ({
      ...academy,
      modalityId: modality.modalityId,
      modalityName: modality.modalityName,
    })),
  );

  if (rows.length === 0) {
    return (
      <AdminEmptyState
        icon={Crown}
        title="Ninguna academia cumple los requisitos todavía"
        description="Una academia aparece acá en cada modalidad en la que cumple los requisitos de la Gran final."
      />
    );
  }

  const columns: DataTableColumn<AcademyModalityRow>[] = [
    {
      id: "academy",
      header: "Academia",
      className: "font-medium",
      cell: (row) => <AcademyCell row={row} />,
    },
    {
      id: "modality",
      header: "Modalidad",
      className: "text-muted-foreground",
      cell: (row) => row.modalityName,
      filterValues: (row) => [row.modalityId],
    },
    {
      id: "status",
      header: "Estado",
      cell: (row) => (row.finalist ? <BannerStatus row={row} /> : "—"),
    },
  ];
  const facetedFilters: DataTableFacetedFiltersOf<
    typeof grandFinalAcademyFacetedFilterIds
  > = [
    {
      id: "modalidad",
      icon: AudioLines,
      label: "Modalidad",
      options: picks.modalities.map((modality) => ({
        label: modality.modalityName,
        value: modality.modalityId,
      })),
    },
  ];

  return (
    <ClientDataTable<AcademyModalityRow>
      columns={columns}
      emptyMessage="Ninguna academia coincide con la búsqueda. Probá con otro nombre o modalidad."
      facetedFilters={facetedFilters}
      getRowKey={(row) => `${row.modalityId}:${row.academyId}`}
      hidePagination
      matchesSearch={(row, search) =>
        matchesListSearch(search, [
          row.name,
          ...row.pickedByJudgeIds.map((id) => judgeNames.get(id) ?? ""),
        ])
      }
      rows={rows}
      searchPlaceholder="Buscar por academia o juez"
    />
  );
}

/**
 * The academy, with a warning when it is here only because a judge picked it
 * before it stopped being eligible. Its name opens its page.
 */
function AcademyCell({ row }: { row: AcademyModalityRow }) {
  return (
    <div className="flex items-center gap-2">
      <DataTableLink
        to={buildAcademyGrandFinalPath(row.academyId, row.modalityId)}
        recordTitle
      >
        {row.name}
      </DataTableLink>
      {row.eligible ? null : (
        <Badge variant="warning">No cumple los requisitos</Badge>
      )}
    </div>
  );
}

/**
 * Whether the finalist has the two banners the vote page shows: both, one of
 * them, or none. An academy no judge picked has no banners to load.
 */
function BannerStatus({ row }: { row: GrandFinalAcademyRow }) {
  if (row.bannerCount >= 2) {
    return <Badge variant="success">Completo</Badge>;
  }

  return row.bannerCount === 1 ? (
    <Badge variant="warning">Incompleto</Badge>
  ) : (
    <Badge variant="destructive">Sin imágenes</Badge>
  );
}

type AuditLinkDialogKind = "blocked" | "create";

/**
 * The creation of an audit link, or, when the live links were at the limit
 * as the item was chosen, the acknowledgment that says so.
 */
function AuditLinkDialog({
  blockReasons,
  kind,
  onClose,
}: {
  blockReasons: AuditLinkCreateBlockReason[];
  kind: AuditLinkDialogKind | null;
  onClose: () => void;
}) {
  if (kind === "create") {
    return (
      <CreateAuditLinkDialog
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
      />
    );
  }

  return (
    <BlockedActionDialog
      description="Cada auditor del público tiene un acceso vigente a la vez."
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={kind === "blocked"}
      reasons={blockReasons.map((reason) => reason.label).join(" ")}
      reasonsTitle="Motivo"
      title="No se puede crear otro acceso de auditoría"
    />
  );
}
