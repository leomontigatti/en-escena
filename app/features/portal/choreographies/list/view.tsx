import { AudioLines, Plus, Settings, Users } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import {
  ClientDataTable,
  DataTableTruncatedText,
  type DataTableColumn,
  type DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { loadPortalChoreographiesList } from "@/features/portal/choreographies/list/server";
import {
  getChoreographyStatusFilterBadgeVariant,
  notWithdrawnChoreographyStatusFilterValue,
  resolveChoreographyStatusBadge,
  withdrawnChoreographyStatusFilterValue,
  withdrawnChoreographyStatusLabel,
} from "@/lib/choreographies/operational-status";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { getPortalChoreographyCreationAvailability } from "@/lib/portal/choreography-creation-availability";
import {
  formatGroupTypeLabel as formatChoreographyGroupTypeLabel,
  type PortalChoreographyListItem,
} from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";
import { notificationToasts } from "@/lib/shared/notification-toasts";
import { showToastMessage } from "@/lib/shared/toasts";

type PortalChoreographiesListRouteProps = {
  loaderData: Awaited<ReturnType<typeof loadPortalChoreographiesList>>;
  created?: boolean;
};

type PortalChoreographiesEventContext =
  PortalChoreographiesListRouteProps["loaderData"]["eventContext"];

export function PortalChoreographiesListRouteView({
  loaderData,
  created = false,
}: PortalChoreographiesListRouteProps) {
  const selectedEvent = loaderData.eventContext.selectedEvent;
  const creationAvailability = getPortalChoreographyCreationAvailability({
    activeDancerCount: loaderData.activeDancerCount,
    eventContext: loaderData.eventContext,
  });

  useEffect(() => {
    if (created) {
      showToastMessage(notificationToasts["coreografia-creada"]);
    }
  }, [created]);

  return (
    <PortalListPage
      titleId="coreografias-title"
      title="Coreografías"
      description="Gestioná las coreografías de tu academia que van a participar del evento y seguí su estado operativo."
      action={
        selectedEvent ? (
          <NewChoreographyButton canCreate={creationAvailability.canCreate} />
        ) : null
      }
    >
      {selectedEvent && loaderData.choreographies.length > 0 ? (
        <ChoreographyTable choreographies={loaderData.choreographies} />
      ) : (
        <PortalEmptyState
          title={getChoreographiesEmptyTitle(loaderData.eventContext)}
          description={getChoreographiesEmptyDescription(
            loaderData.eventContext,
          )}
        />
      )}
    </PortalListPage>
  );
}

function ChoreographyTable({
  choreographies,
}: {
  choreographies: PortalChoreographiesListRouteProps["loaderData"]["choreographies"];
}) {
  const columns: DataTableColumn<PortalChoreographyListItem>[] = [
    {
      id: "number",
      header: "#",
      width: 7,
      className: "font-medium tabular-nums",
      cell: (choreography) =>
        formatEventSequenceNumber(choreography.choreographyNumber),
      filterValue: (choreography) =>
        formatEventSequenceNumber(choreography.choreographyNumber),
      sortValue: (choreography) => choreography.choreographyNumber,
    },
    {
      id: "name",
      header: "Nombre",
      width: 37,
      className: "font-medium",
      // The name is the row's only way into the detail. Linking the number too
      // gave one destination two targets, which reads as a choice and is not.
      cell: (choreography) => (
        <DataTableTruncatedText value={choreography.name}>
          <DataTableLink to={`/portal/coreografias/${choreography.id}`}>
            {choreography.name}
          </DataTableLink>
        </DataTableTruncatedText>
      ),
      // The search box filters this one column, so everything meant to be
      // searchable travels in here. The number is included zero-padded, which
      // is how `00042`, `042` and `42` all reach the same choreography.
      filterValue: (choreography) =>
        [
          formatEventSequenceNumber(choreography.choreographyNumber),
          choreography.name,
          choreography.modalityName,
          choreography.submodalityName,
          choreography.categoryName,
          formatChoreographyGroupTypeLabel(choreography.groupType),
        ]
          .filter(Boolean)
          .join(" "),
      sortValue: (choreography) => choreography.name,
    },
    {
      id: "modality",
      header: "Modalidad / Submodalidad",
      width: 21,
      cell: (choreography) => (
        <DataTableTruncatedText
          className="text-muted-foreground"
          value={formatPrimaryAndSecondaryValue(
            choreography.modalityName,
            choreography.submodalityName,
          )}
        />
      ),
      filterValue: (choreography) =>
        [choreography.modalityName, choreography.submodalityName]
          .filter(Boolean)
          .join(" "),
    },
    {
      id: "categoryGroup",
      header: "Categoría / Tipo de grupo",
      width: 22,
      cell: (choreography) => (
        <DataTableTruncatedText
          className="text-muted-foreground"
          value={formatPrimaryAndSecondaryValue(
            choreography.categoryName,
            formatChoreographyGroupTypeLabel(choreography.groupType),
          )}
        />
      ),
      filterValue: (choreography) =>
        [
          choreography.categoryName,
          formatChoreographyGroupTypeLabel(choreography.groupType),
        ].join(" "),
    },
    {
      id: "status",
      header: "Estado",
      width: 13,
      cell: (choreography) => (
        <ChoreographyStatusBadge choreography={choreography} />
      ),
      // The readiness codes travel only on the rows taking part, so `Completa`
      // never turns up a withdrawn choreography either: what the cell shows and
      // what the filter matches on are the same badge.
      filterValues: (choreography) => [
        ...(choreography.isWithdrawn
          ? [withdrawnChoreographyStatusFilterValue]
          : [
              choreography.operationalStatus.code,
              notWithdrawnChoreographyStatusFilterValue,
            ]),
        choreography.modalityName,
        choreography.categoryName,
        choreography.groupType,
      ],
    },
  ];

  return (
    <ClientDataTable
      rows={choreographies}
      columns={columns}
      getRowKey={(choreography) => choreography.id}
      // Same shares as the admin list this mirrors, minus its academy column.
      layout="fit"
      searchPlaceholder="Buscar por número, nombre o modalidad"
      textFilterColumnId="name"
      facetedFilters={buildChoreographyFacetedFilters(choreographies)}
      baseFacetedFilterValues={baseChoreographyFilters}
      emptyMessage="No hay coreografías que coincidan con la búsqueda o los filtros."
      initialSort={{ columnId: "number", direction: "asc" }}
    />
  );
}

/**
 * The list opens on what is going to be performed. The pin sits on `estado`,
 * which is the group that offers `Retirada`, so picking any answer there —that
 * one included— lifts it and the academy reaches its withdrawn choreographies.
 */
const baseChoreographyFilters = {
  filters: {
    estado: notWithdrawnChoreographyStatusFilterValue,
  },
};

export const portalChoreographyFacetedFilterIds = [
  "estado",
  "modalidad",
  "categoria",
  "tipo-de-grupo",
] as const;

/** How each `Estado` answer this list writes to the URL reads as a badge. */
const statusFilterAnswers: Record<
  string,
  "complete" | "incomplete" | "withdrawn"
> = {
  complete: "complete",
  incomplete: "incomplete",
  [withdrawnChoreographyStatusFilterValue]: "withdrawn",
};

function buildChoreographyFacetedFilters(
  choreographies: PortalChoreographyListItem[],
): DataTableFacetedFiltersOf<typeof portalChoreographyFacetedFilterIds> {
  return [
    {
      id: "estado",
      label: "Estado",
      options: [
        { label: "Completa", value: "complete" },
        { label: "Incompleta", value: "incomplete" },
        {
          label: withdrawnChoreographyStatusLabel,
          value: withdrawnChoreographyStatusFilterValue,
        },
      ],
      renderValue: (option) => (
        <Badge
          variant={getChoreographyStatusFilterBadgeVariant(
            statusFilterAnswers[option.value] ?? "incomplete",
          )}
          className="font-normal"
        >
          {option.label}
        </Badge>
      ),
    },
    {
      id: "modalidad",
      icon: AudioLines,
      label: "Modalidad",
      options: getUniqueSortedOptions(
        choreographies.map((choreography) => ({
          label: choreography.modalityName,
          value: choreography.modalityName,
        })),
      ),
    },
    {
      id: "categoria",
      icon: Settings,
      label: "Categoría",
      options: getUniqueSortedOptions(
        choreographies.map((choreography) => ({
          label: choreography.categoryName,
          value: choreography.categoryName,
        })),
      ),
    },
    {
      id: "tipo-de-grupo",
      icon: Users,
      label: "Tipo de grupo",
      options: [
        { label: "Solo", value: "solo" },
        { label: "Dúo", value: "duo" },
        { label: "Trío", value: "trio" },
        { label: "Grupal", value: "grupal" },
      ],
    },
  ];
}

function getUniqueSortedOptions(
  options: Array<{ label: string; value: string }>,
) {
  return Array.from(
    new Map(options.map((option) => [option.value, option])).values(),
  ).sort((firstOption, secondOption) =>
    firstOption.label.localeCompare(secondOption.label, "es-AR"),
  );
}

/**
 * `Retirada` **replaces** the readiness badge rather than sitting next to it: a
 * choreography that is not taking part is not half-loaded, it is out, and what
 * it still lacks is no longer anyone's task. Which of the two it is comes from
 * the shared resolver, so this cell and the administrator's read the same way.
 */
function ChoreographyStatusBadge({
  choreography,
}: {
  choreography: PortalChoreographyListItem;
}) {
  const badge = resolveChoreographyStatusBadge(choreography);

  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

function getChoreographiesEmptyTitle(
  eventContext: PortalChoreographiesEventContext,
) {
  if (eventContext.selectedEvent) {
    return "No hay coreografías registradas para este evento";
  }

  if (eventContext.hasEvents) {
    return "Todavía no hay un evento activo";
  }

  return "Todavía no hay eventos configurados";
}

function getChoreographiesEmptyDescription(
  eventContext: PortalChoreographiesEventContext,
) {
  if (eventContext.selectedEvent) {
    return "Cuando registres una coreografía para el evento activo, la vas a poder seguir acá junto con su estado operativo.";
  }

  if (eventContext.hasEvents) {
    return "Cuando administración active un evento, vas a poder consultar las coreografías de tu academia desde esta sección.";
  }

  return "Cuando administración cree un evento, vas a poder consultar las coreografías de tu academia desde esta sección.";
}

function NewChoreographyButton({ canCreate }: { canCreate: boolean }) {
  if (!canCreate) {
    return (
      <Button type="button" disabled>
        <Plus aria-hidden="true" data-icon="inline-start" />
        Nueva coreografía
      </Button>
    );
  }

  return (
    <Button asChild>
      <Link to="/portal/coreografias/crear">
        <Plus aria-hidden="true" data-icon="inline-start" />
        Nueva coreografía
      </Link>
    </Button>
  );
}
