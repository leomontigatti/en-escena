import { useActionData } from "react-router";

import type { PortalRouteHandle } from "@/components/portal/ui";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  resolveChoreographyDancersIntent,
  type CoreografiaPeopleEditorActionData,
} from "@/lib/portal/coreografia-people-editor";
import { PortalCoreografiaDetalleRouteView } from "@/lib/portal/coreografia-detail";
import {
  handlePortalCoreografiaDetalleAction,
  loadCoreografiaPeopleEditorOptions,
} from "@/lib/portal/coreografia-detail.server";
import {
  findChoreographyForAcademyEvent,
  getChoreographyDeletionAvailability,
} from "@/lib/portal/choreographies.server";
import { getPortalActiveEventContext } from "@/lib/portal/event-context.server";

const choreographyNotFoundMessage = "No encontramos esa Coreografía.";
const readOnlyEventMessage = "Este Evento es de solo lectura.";

type DancerResolutionActionData = {
  intent: typeof resolveChoreographyDancersIntent;
};

type ActionData = CoreografiaPeopleEditorActionData;

type PortalCoreografiaDetalleRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
  actionData?: ActionData;
  initialDeleteDialogOpen?: boolean;
};

type LoaderData = PortalCoreografiaDetalleRouteProps["loaderData"];

export const meta = () => [
  { title: "Detalle de Coreografía | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Coreografías", to: "/portal/coreografias" },
    (match) => {
      const data = match.data as LoaderData | undefined;

      return data?.choreography ? { label: data.choreography.name } : null;
    },
  ],
} satisfies PortalRouteHandle;

export { PortalCoreografiaDetalleRouteView };

export function shouldRevalidate({
  defaultShouldRevalidate,
  formData,
}: {
  defaultShouldRevalidate: boolean;
  formData?: FormData;
}) {
  if (formData?.get("intent") === resolveChoreographyDancersIntent) {
    return false;
  }

  return defaultShouldRevalidate;
}

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { choreographyId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const choreographyId = params.choreographyId;

  if (!choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const eventContext = await getPortalActiveEventContext(request);
  const selectedEventId = eventContext.selectedEvent?.id;

  if (!selectedEventId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const choreography = await findChoreographyForAcademyEvent(
    academy.id,
    selectedEventId,
    choreographyId,
    {
      isRegistrationOpen: eventContext.isRegistrationOpen,
    },
  );

  if (!choreography) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const { availableDancers, availableProfessors } =
    await loadCoreografiaPeopleEditorOptions({
      academyId: academy.id,
      choreography,
    });

  return {
    choreography,
    dancerEditingEligibility: choreography.dancerEditingEligibility,
    availableDancers,
    availableProfessors,
    deletionAvailability: getChoreographyDeletionAvailability({
      isReadOnly: eventContext.isReadOnly,
      isRegistrationOpen: eventContext.isRegistrationOpen,
    }),
    eventContext,
    successMessage: null,
  };
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { choreographyId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const choreographyId = readChoreographyId(params);
  const eventContext = await getPortalActiveEventContext(request);
  const selectedEventId = eventContext.selectedEvent?.id;

  if (!selectedEventId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  if (eventContext.isReadOnly) {
    throw new Response(readOnlyEventMessage, { status: 403 });
  }

  return await handlePortalCoreografiaDetalleAction({
    academyId: academy.id,
    choreographyId,
    eventId: selectedEventId,
    formData: await request.formData(),
    isRegistrationOpen: eventContext.isRegistrationOpen,
  });
}

export default function PortalCoreografiaDetalleRoute({
  loaderData,
}: PortalCoreografiaDetalleRouteProps) {
  const actionData = getUpdateActionData(useActionData<typeof action>());

  return (
    <PortalCoreografiaDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

function getUpdateActionData(
  actionData: ActionData | DancerResolutionActionData,
): ActionData {
  if (!actionData || !("status" in actionData)) {
    return undefined;
  }

  return actionData.status === "update-error" ? actionData : undefined;
}

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  return params.choreographyId;
}
