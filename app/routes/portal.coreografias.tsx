import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, redirect, useFetcher, useSearchParams } from "react-router";

import { AccessNotice } from "@/components/auth/access-ui";
import { CreateChoreographyDialog } from "@/components/portal/choreography-create-dialog";
import {
  PortalEmptyState,
  PortalListPage,
  type PortalRouteHandle,
} from "@/components/portal/ui";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  formatGroupTypeLabel as formatChoreographyGroupTypeLabel,
  formatOperationalStatusLabel,
  type ChoreographyListItem,
} from "@/lib/portal/choreographies";
import { showRouteNotificationToast } from "@/lib/shared/route-notification-toasts";
import { createChoreographyRegistration } from "@/lib/choreographies/registration-confirmation.server";
import { resolveChoreographyRegistrationOperation } from "@/lib/choreographies/registration-resolution.server";
import {
  CREATE_CHOREOGRAPHY_INTENT,
  RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT,
} from "@/lib/portal/choreography-create-flow";
import type { CreateChoreographyDialogLoaderData } from "@/lib/portal/choreography-create-dialog.server";
import type {
  CalculationActionData,
  CreateActionData,
} from "@/lib/portal/choreography-create-flow";
import { listChoreographiesForAcademyEvent } from "@/lib/portal/choreographies.server";
import { getPortalChoreographyCreationAvailability } from "@/lib/portal/choreography-creation-availability";
import { countActiveDancersForAcademy } from "@/lib/portal/dancers.server";
import { getPortalEventContext } from "@/lib/portal/event-context.server";

type PortalCoreografiasRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
  created?: boolean;
  deleted?: boolean;
  initialCreateDialogOpen?: boolean;
};

type PortalCoreografiasLoaderData = PortalCoreografiasRouteProps["loaderData"];
type PortalCoreografiasEventContext =
  PortalCoreografiasLoaderData["eventContext"];

export const meta = () => [
  { title: "Coreografías | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Coreografías" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  const { academy } = await requireAcademyUser(request);
  const eventContext = await getPortalEventContext(request);
  const selectedEventId = eventContext.selectedEvent?.id ?? null;
  const [choreographies, activeDancerCount] = await Promise.all([
    selectedEventId
      ? listChoreographiesForAcademyEvent(academy.id, selectedEventId)
      : Promise.resolve([]),
    countActiveDancersForAcademy(academy.id),
  ]);

  return {
    choreographies,
    eventContext,
    activeDancerCount,
  };
}

export async function action({ request }: { request: Request }) {
  const { academy } = await requireAcademyUser(request);
  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent === RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT) {
    return {
      intent,
      result: await resolveChoreographyRegistrationOperation({
        academyId: academy.id,
        eventId: readFormString(formData, "eventId"),
        modalityId: readFormString(formData, "modalityId"),
        submodalityId: readOptionalFormString(formData, "submodalityId"),
        dancerIds: readFormStringArray(formData, "dancerIds"),
      }),
    } satisfies CalculationActionData;
  }

  if (intent === CREATE_CHOREOGRAPHY_INTENT) {
    const result = await createChoreographyRegistration({
      academyId: academy.id,
      eventId: readFormString(formData, "eventId"),
      name: readFormString(formData, "name"),
      modalityId: readFormString(formData, "modalityId"),
      submodalityId: readOptionalFormString(formData, "submodalityId"),
      dancerIds: readFormStringArray(formData, "dancerIds"),
      professorIds: readFormStringArray(formData, "professorIds"),
      experienceLevelId: readOptionalFormString(formData, "experienceLevelId"),
      scheduleCapacityId: readFormString(formData, "scheduleCapacityId"),
    });

    if (!result.ok) {
      return {
        intent,
        result,
      } satisfies CreateActionData;
    }

    throw redirect("/portal/coreografias?creada=1");
  }

  throw new Response("Acción no soportada.", { status: 400 });
}

export function PortalCoreografiasRouteView({
  loaderData,
  created = false,
  deleted = false,
  initialCreateDialogOpen = false,
}: PortalCoreografiasRouteProps) {
  const selectedEvent = loaderData.eventContext.selectedEvent;
  const creationAvailability = getPortalChoreographyCreationAvailability({
    activeDancerCount: loaderData.activeDancerCount,
    eventContext: loaderData.eventContext,
  });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(
    initialCreateDialogOpen,
  );

  useEffect(() => {
    if (created) {
      showRouteNotificationToast("coreografia-creada");
    }
  }, [created]);

  return (
    <>
      <PortalListPage
        titleId="coreografias-title"
        title="Coreografías"
        description="Gestioná las coreografías de tu academia que van a participar del evento y seguí su estado operativo."
        action={
          selectedEvent ? (
            <Button
              type="button"
              disabled={!creationAvailability.canCreate}
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus aria-hidden="true" data-icon />
              Nueva coreografía
            </Button>
          ) : null
        }
      >
        {deleted ? (
          <AccessNotice variant="success">
            La coreografía se eliminó correctamente.
          </AccessNotice>
        ) : null}

        {selectedEvent && loaderData.choreographies.length > 0 ? (
          <ChoreographyTable choreographies={loaderData.choreographies} />
        ) : (
          <PortalEmptyState
            title={getCoreografiasEmptyTitle(loaderData.eventContext)}
            description={getCoreografiasEmptyDescription(
              loaderData.eventContext,
            )}
          />
        )}
      </PortalListPage>

      {isCreateModalOpen && selectedEvent ? (
        <CreateChoreographyDialogLoader
          eventId={selectedEvent.id}
          onClose={() => setIsCreateModalOpen(false)}
        />
      ) : null}
    </>
  );
}

export default function PortalCoreografiasRoute({
  loaderData,
}: {
  loaderData: Awaited<ReturnType<typeof loader>>;
}) {
  const [searchParams] = useSearchParams();

  return (
    <PortalCoreografiasRouteView
      created={searchParams.get("creada") === "1"}
      deleted={searchParams.get("eliminada") === "1"}
      loaderData={loaderData}
    />
  );
}

function ChoreographyTable({
  choreographies,
}: {
  choreographies: PortalCoreografiasRouteProps["loaderData"]["choreographies"];
}) {
  const columns: DataTableColumn<ChoreographyListItem>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "font-medium",
      cell: (choreography) => (
        <Link
          to={`/portal/coreografias/${choreography.id}`}
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {choreography.name}
        </Link>
      ),
      filterValue: (choreography) =>
        [
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
      cell: (choreography) => (
        <span className="text-muted-foreground">
          {formatPrimaryAndSecondaryValue(
            choreography.modalityName,
            choreography.submodalityName,
          )}
        </span>
      ),
      filterValue: (choreography) =>
        [choreography.modalityName, choreography.submodalityName]
          .filter(Boolean)
          .join(" "),
    },
    {
      id: "categoryGroup",
      header: "Categoría / Tipo de grupo",
      cell: (choreography) => (
        <span className="text-muted-foreground">
          {formatPrimaryAndSecondaryValue(
            choreography.categoryName ?? "Sin asignar",
            formatChoreographyGroupTypeLabel(choreography.groupType),
          )}
        </span>
      ),
      filterValue: (choreography) =>
        [
          choreography.categoryName ?? "Sin asignar",
          formatChoreographyGroupTypeLabel(choreography.groupType),
        ].join(" "),
    },
    {
      id: "status",
      header: "Estado",
      cell: (choreography) => (
        <OperationalStatusBadge choreography={choreography} />
      ),
      filterValues: (choreography) => [
        choreography.operationalStatus.code,
        choreography.modalityName,
        choreography.categoryName ?? "pending-category",
        choreography.groupType,
      ],
    },
  ];

  return (
    <DataTable
      mode="client"
      rows={choreographies}
      columns={columns}
      getRowKey={(choreography) => choreography.id}
      searchPlaceholder="Buscar coreografía por nombre, modalidad o categoría"
      textFilterColumnId="name"
      facetedFilters={buildChoreographyFacetedFilters(choreographies)}
      emptyMessage="No hay coreografías que coincidan con la búsqueda o los filtros."
      initialSort={{ columnId: "name", direction: "asc" }}
    />
  );
}

function buildChoreographyFacetedFilters(
  choreographies: ChoreographyListItem[],
) {
  return [
    {
      columnId: "status",
      label: "Filtros",
      groups: [
        {
          label: "Estado",
          options: [
            { label: "Completa", value: "complete" },
            { label: "Incompleta", value: "incomplete" },
          ],
        },
        {
          label: "Modalidad",
          options: getUniqueSortedOptions(
            choreographies.map((choreography) => ({
              label: choreography.modalityName,
              value: choreography.modalityName,
            })),
          ),
        },
        {
          label: "Categoría",
          options: getUniqueSortedOptions(
            choreographies.map((choreography) => ({
              label: choreography.categoryName ?? "Sin asignar",
              value: choreography.categoryName ?? "pending-category",
            })),
          ),
        },
        {
          label: "Tipo de grupo",
          options: [
            { label: "Solo", value: "solo" },
            { label: "Dúo", value: "duo" },
            { label: "Trío", value: "trio" },
            { label: "Grupal", value: "grupal" },
          ],
        },
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

function OperationalStatusBadge({
  choreography,
}: {
  choreography: ChoreographyListItem;
}) {
  if (choreography.operationalStatus.code === "complete") {
    return <Badge variant="secondary">Completa</Badge>;
  }

  return (
    <Badge variant="outline">
      {formatOperationalStatusLabel(choreography.operationalStatus)}
    </Badge>
  );
}

function getCoreografiasEmptyTitle(
  eventContext: PortalCoreografiasEventContext,
) {
  if (!eventContext.selectedEvent) {
    return eventContext.hasEvents
      ? "Todavía no hay un evento activo"
      : "Todavía no hay eventos configurados";
  }

  return "No hay coreografías registradas para este evento";
}

function getCoreografiasEmptyDescription(
  eventContext: PortalCoreografiasEventContext,
) {
  if (!eventContext.selectedEvent) {
    return eventContext.hasEvents
      ? "Cuando administración active un evento, vas a poder consultar las coreografías de tu academia desde esta sección."
      : "Cuando administración cree un evento, vas a poder consultar las coreografías de tu academia desde esta sección.";
  }

  return "Cuando registres una coreografía para el evento activo, la vas a poder seguir acá junto con su estado operativo.";
}

function formatPrimaryAndSecondaryValue(
  primaryValue: string,
  secondaryValue: string | null,
) {
  return secondaryValue ? `${primaryValue} · ${secondaryValue}` : primaryValue;
}

function CreateChoreographyDialogLoader({
  eventId,
  onClose,
}: {
  eventId: string;
  onClose: () => void;
}) {
  const fetcher = useFetcher<CreateChoreographyDialogLoaderData>();

  useEffect(() => {
    if (fetcher.state !== "idle" || fetcher.data) {
      return;
    }

    fetcher.load("/portal/coreografias/crear");
  }, [fetcher]);

  if (!fetcher.data) {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        className="sr-only"
        data-testid="create-choreography-dialog-loading"
      >
        Cargando opciones para crear la coreografía.
      </div>
    );
  }

  return (
    <CreateChoreographyDialog
      baseOptions={fetcher.data.registrationBaseOptions}
      dancers={fetcher.data.activeDancers}
      eventId={eventId}
      professors={fetcher.data.activeProfessors}
      onClose={onClose}
    />
  );
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function readOptionalFormString(formData: FormData, key: string) {
  const value = readFormString(formData, key).trim();

  return value.length > 0 ? value : null;
}

function readFormStringArray(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" && value ? [value] : []));
}
