import { redirect, useActionData } from "react-router";

import type { PortalRouteHandle } from "@/components/portal/ui";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  loadPortalDancerDocumentImageUrls,
  requirePortalDancer,
  resolvePortalDancerDocumentImageStorageKeys,
} from "@/lib/portal/dancer-detail.server";
import {
  getClientDocumentImageValidationMessage,
  readPortalDancerFormValues,
  readPortalDancerId,
  readFormString,
  type PortalDancerDetailActionData,
  type PortalDancerDetailLoaderData,
  type PortalDancerStatusIntent,
} from "@/lib/portal/dancer-detail.shared";
import { PortalBailarinDetalleRouteView as BailarinDetalleView } from "@/lib/portal/dancer-detail-view";
import {
  archiveDancerForAcademy,
  reactivateDancerForAcademy,
  updateDancerForAcademy,
} from "@/lib/portal/dancers.server";

type LoaderData = PortalDancerDetailLoaderData;
type ActionData = PortalDancerDetailActionData;

type PortalBailarinDetalleRouteProps = {
  loaderData: LoaderData;
  actionData?: ActionData;
  initialStatusDialogIntent?: PortalDancerStatusIntent | null;
};

export const meta = () => [
  { title: "Editar bailarín | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Bailarines", to: "/portal/bailarines" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      const dancer = data?.dancer;

      return dancer
        ? { label: `${dancer.firstName} ${dancer.lastName}` }
        : null;
    },
  ],
} satisfies PortalRouteHandle;

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { dancerId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const dancerId = readPortalDancerId(params);
  const dancer = await requirePortalDancer(academy.id, dancerId);

  return {
    dancer,
    documentImageUrls: await loadPortalDancerDocumentImageUrls(dancer),
  };
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { dancerId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const dancerId = readPortalDancerId(params);
  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent === "archive-dancer") {
    await archiveDancerForAcademy(academy.id, dancerId);
    throw redirect(
      `/portal/bailarines/${dancerId}?notificacion=bailarin-archivado`,
    );
  }

  if (intent === "reactivate-dancer") {
    await reactivateDancerForAcademy(academy.id, dancerId);
    throw redirect(
      `/portal/bailarines/${dancerId}?notificacion=bailarin-reactivado`,
    );
  }

  if (intent !== "" && intent !== "update-dancer") {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const submittedValues = readPortalDancerFormValues(formData);
  const clientImageValidationMessage =
    getClientDocumentImageValidationMessage(formData);

  if (clientImageValidationMessage) {
    return {
      status: "error" as const,
      message: clientImageValidationMessage,
      fieldErrors: {},
      values: submittedValues,
    };
  }

  const documentImageStorageKeys =
    await resolvePortalDancerDocumentImageStorageKeys({
      academyId: academy.id,
      dancerId,
      formData,
    });

  if (!documentImageStorageKeys.ok) {
    return {
      status: "error" as const,
      message: documentImageStorageKeys.message,
      fieldErrors: {},
      values: submittedValues,
    };
  }

  const result = await updateDancerForAcademy(academy.id, dancerId, {
    ...submittedValues,
    documentFrontImageStorageKey: documentImageStorageKeys.keys.front,
    documentBackImageStorageKey: documentImageStorageKeys.keys.back,
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.error,
      fieldErrors: result.fieldErrors,
      values: result.values,
    };
  }

  throw redirect(
    `/portal/bailarines/${dancerId}?notificacion=bailarin-guardado`,
  );
}

export function PortalBailarinDetalleRouteView({
  loaderData,
  actionData: actionDataOverride,
  initialStatusDialogIntent = null,
}: PortalBailarinDetalleRouteProps) {
  const actionData =
    actionDataOverride?.status === "error" ? actionDataOverride : undefined;

  return (
    <BailarinDetalleView
      loaderData={loaderData}
      actionData={actionData}
      initialStatusDialogIntent={initialStatusDialogIntent}
    />
  );
}

export default function PortalBailarinDetalleRoute({
  loaderData,
}: PortalBailarinDetalleRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <PortalBailarinDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
