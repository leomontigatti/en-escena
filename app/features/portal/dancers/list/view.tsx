import { PortalListPageActions } from "@/components/portal/list-page-actions";
import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import {
  documentTypeEmptyLabel,
  formatIdentityDocument,
} from "@/lib/roster/identity-document";
import { matchesRosterPersonSearch } from "@/lib/roster/roster-person-search";
import {
  getParticipationBadgeVariant,
  getParticipationLabel,
} from "@/lib/participation/participation.shared";
import {
  defaultRosterPersonStatusFilter,
  getRosterPersonStatusLabel,
  toRosterPersonStatus,
} from "@/lib/roster/roster-person-status.shared";
import {
  buildDancerVerificationFacet,
  DancerVerificationBadge,
} from "@/components/shared/dancer-verification-badge";
import { RosterPersonStatusBadge } from "@/components/shared/roster-person-status-badge";
import { type PortalDancersListLoaderData } from "@/features/portal/dancers/list/shared";

type LoaderData = PortalDancersListLoaderData;
type DancerRow = LoaderData["dancers"][number];

const dancerDocumentKinds = ["minor_authorization", "adult_contract"] as const;

const baseDancerFilters = {
  filters: {
    archivo: defaultRosterPersonStatusFilter,
  },
};

export const portalDancerFacetedFilterIds = [
  "participacion",
  "verificacion",
  "archivo",
] as const;

const dancerFacetedFilters: DataTableFacetedFiltersOf<
  typeof portalDancerFacetedFilterIds
> = [
  {
    id: "participacion",
    label: "Participación",
    options: [
      { label: "Participando", value: "participating" },
      { label: "No participando", value: "not-participating" },
    ],
    renderValue: (option) => (
      <Badge
        variant={getParticipationBadgeVariant(
          option.value === "participating"
            ? "participating"
            : "not-participating",
        )}
      >
        {option.label}
      </Badge>
    ),
  },
  {
    id: "verificacion",
    // The client filter matches these values against each row's status code.
    ...buildDancerVerificationFacet((code) => code),
  },
  {
    id: "archivo",
    label: "Estado de alta",
    options: [
      {
        label: getRosterPersonStatusLabel("archived"),
        value: "archived",
      },
    ],
    renderValue: () => <RosterPersonStatusBadge status="archived" />,
  },
];

export function PortalDancersListRouteView({
  loaderData,
}: {
  loaderData: LoaderData;
}) {
  return (
    <PortalListPage
      titleId="dancers-title"
      title="Bailarines"
      description="Gestioná los bailarines de tu academia y priorizá los registros que todavía necesitan documento o imágenes."
      action={
        <PortalListPageActions
          createLabel="Nuevo bailarín"
          createTo="/portal/bailarines/nuevo"
          documentDownloadUrls={loaderData.documentDownloadUrls}
          kinds={dancerDocumentKinds}
        />
      }
    >
      {loaderData.dancers.length > 0 ? (
        <DancersTable dancers={loaderData.dancers} />
      ) : (
        <PortalEmptyState
          title="Todavía no cargaste bailarines"
          description="Cuando cargues bailarines, van a aparecer en esta lista para usarlos en coreografías."
        />
      )}
    </PortalListPage>
  );
}

function DancersTable({ dancers }: { dancers: DancerRow[] }) {
  const columns: DataTableColumn<DancerRow>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "w-1/2 font-medium",
      headerClassName: "w-1/2",
      cell: (dancer) => (
        <DataTableLink recordTitle to={`/portal/bailarines/${dancer.id}`}>
          {dancer.firstName} {dancer.lastName}
        </DataTableLink>
      ),
      sortValue: (dancer) => `${dancer.firstName} ${dancer.lastName}`,
    },
    {
      id: "document",
      header: "Documento",
      className: "w-1/4 text-muted-foreground",
      headerClassName: "w-1/4",
      cell: (dancer) =>
        formatIdentityDocument(dancer) ?? (
          <span className="text-muted-foreground">
            {documentTypeEmptyLabel}
          </span>
        ),
    },
    {
      id: "status",
      header: "Estado",
      className: "w-1/4",
      headerClassName: "w-1/4",
      cell: (dancer) => (
        <div className="flex gap-2">
          {dancer.participationStatus !== "no-event" ? (
            <Badge
              variant={getParticipationBadgeVariant(dancer.participationStatus)}
            >
              {getParticipationLabel(dancer.participationStatus)}
            </Badge>
          ) : null}
          <RosterPersonStatusBadge
            status={toRosterPersonStatus(dancer.active)}
          />
          <DancerVerificationBadge code={dancer.verificationStatus} />
        </div>
      ),
      filterValues: (dancer) => [
        toRosterPersonStatus(dancer.active),
        dancer.participationStatus,
        dancer.verificationStatus,
      ],
    },
  ];

  return (
    <ClientDataTable
      rows={dancers}
      columns={columns}
      getRowKey={(dancer) => dancer.id}
      searchPlaceholder="Buscar por nombre o documento"
      matchesSearch={matchesRosterPersonSearch}
      facetedFilters={dancerFacetedFilters}
      baseFacetedFilterValues={baseDancerFilters}
      emptyMessage="No hay bailarines que coincidan con la búsqueda o los filtros."
      initialSort={{ columnId: "name", direction: "asc" }}
    />
  );
}
