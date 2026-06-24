import { redirect, useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  buildBackToListHref,
  buildDancerActionError,
  buildDancerStatusSchema,
  buildDancerUpdateSchema,
  buildDetailNotificationHref,
  buildModeHref,
  dancerFieldNames,
  readDancerStatusValues,
  readDancerUpdateValues,
  type DancerActionError,
  type DancerDetailLoaderData,
} from "@/lib/admin/dancers/dancer-detail.shared";
import {
  AdministracionBailarinDetalleRouteView as BailarinDetalleView,
  type InscriptionsSectionProps,
  InscriptionsSection,
} from "@/lib/admin/dancers/dancer-detail-view";
import {
  adminDancerCorrectionReasonMessage,
  adminDancerNotFoundMessage,
} from "@/lib/admin/dancers/dancers.shared";
import {
  findAdministrativeDancer,
  setAdministrativeDancerActiveState,
  updateAdministrativeDancer,
  verifyAdministrativeDancerIdentity,
} from "@/lib/admin/dancers/dancers.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { getFieldErrors } from "@/lib/shared/form-validation";
import { createDefaultDancerDocumentStorage } from "@/lib/storage/dancer-documents.server";

import type { Route } from "./+types/administracion.bailarines_.$dancerId";

type LoaderData = DancerDetailLoaderData;
type ActionData = Awaited<ReturnType<typeof action>>;

type AdministracionBailarinDetalleRouteProps = {
  loaderData: LoaderData;
  actionData?: ActionData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Bailarín | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Bailarines", to: "/administracion/bailarines" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      const dancer = data?.dancer;
      return dancer
        ? { label: `${dancer.firstName} ${dancer.lastName}` }
        : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const dancerId = params.dancerId;

  if (!dancerId) {
    throw new Response(adminDancerNotFoundMessage, { status: 404 });
  }

  const dancer = await findAdministrativeDancer({
    dancerId,
    selectedEventId: eventContext.selectedEventId,
  });

  if (!dancer) {
    throw new Response(adminDancerNotFoundMessage, { status: 404 });
  }

  const url = new URL(request.url);

  return {
    canEdit: user.role === "admin",
    selectedEventId: eventContext.selectedEventId,
    dancer,
    documentImageUrls: await loadDancerDocumentImageUrls(dancer),
    backToList: buildBackToListHref(request.url),
    editHref: buildModeHref(url, dancerId, "editar"),
    cancelHref: buildModeHref(url, dancerId, null),
    isEditing:
      user.role === "admin" && url.searchParams.get("modo") === "editar",
  };
}

async function loadDancerDocumentImageUrls(
  dancer: NonNullable<Awaited<ReturnType<typeof findAdministrativeDancer>>>,
) {
  if (
    !dancer.documentFrontImageStorageKey &&
    !dancer.documentBackImageStorageKey
  ) {
    return {
      back: null,
      front: null,
    };
  }

  try {
    const storage = createDefaultDancerDocumentStorage();

    return {
      back: await createOptionalDocumentImageSignedUrl(
        storage,
        dancer.documentBackImageStorageKey,
      ),
      front: await createOptionalDocumentImageSignedUrl(
        storage,
        dancer.documentFrontImageStorageKey,
      ),
    };
  } catch {
    return {
      back: null,
      front: null,
    };
  }
}

async function createOptionalDocumentImageSignedUrl(
  storage: ReturnType<typeof createDefaultDancerDocumentStorage>,
  storageKey: string | null,
) {
  if (!storageKey) {
    return null;
  }

  try {
    return await storage.createDocumentImageSignedUrl(storageKey);
  } catch {
    return null;
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  const adminUser = await requireAdminUser(request);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const dancerId = params.dancerId;

  if (!dancerId) {
    throw new Response(adminDancerNotFoundMessage, { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  const dancer = await findAdministrativeDancer({
    dancerId,
    selectedEventId: eventContext.selectedEventId,
  });

  if (!dancer) {
    throw new Response(adminDancerNotFoundMessage, { status: 404 });
  }

  if (intent === "archive-dancer" || intent === "reactivate-dancer") {
    const values = readDancerStatusValues(formData);
    const parsed = buildDancerStatusSchema(
      dancer.correctionReasonRequired,
    ).safeParse(values);

    if (!parsed.success) {
      return buildDancerActionError(
        "Revisá los campos marcados.",
        getFieldErrors(parsed.error, dancerFieldNames),
        values,
      );
    }

    const result = await setAdministrativeDancerActiveState({
      action: intent === "archive-dancer" ? "archive" : "reactivate",
      adminUserId: adminUser.id,
      dancerId,
      selectedEventId: eventContext.selectedEventId,
      correctionReason: parsed.data.correctionReason,
    });

    if (!result.ok) {
      return buildDancerActionError(result.message, result.fieldErrors, values);
    }

    throw redirect(
      buildDetailNotificationHref(
        request.url,
        dancerId,
        intent === "archive-dancer"
          ? "bailarin-archivado"
          : "bailarin-reactivado",
      ),
    );
  }

  if (intent === "verify-dancer-identity") {
    await verifyAdministrativeDancerIdentity({
      adminUserId: adminUser.id,
      dancerId,
      selectedEventId: eventContext.selectedEventId,
    });

    throw redirect(
      buildDetailNotificationHref(request.url, dancerId, "bailarin-verificado"),
    );
  }

  const submittedValues = readDancerUpdateValues(formData);
  const values = {
    ...submittedValues,
    documentBackImageStorageKey: dancer.documentBackImageStorageKey ?? "",
    documentFrontImageStorageKey: dancer.documentFrontImageStorageKey ?? "",
  };
  const parsed = buildDancerUpdateSchema(
    dancer.correctionReasonRequired,
  ).safeParse(values);

  if (!parsed.success) {
    return buildDancerActionError(
      "Revisá los campos marcados.",
      getFieldErrors(parsed.error, dancerFieldNames),
      values,
    );
  }

  const result = await updateAdministrativeDancer({
    adminUserId: adminUser.id,
    dancerId,
    selectedEventId: eventContext.selectedEventId,
    values: parsed.data,
  });

  if (!result.ok) {
    return buildDancerActionError(
      result.message,
      result.fieldErrors,
      result.values,
    );
  }

  throw redirect(
    buildDetailNotificationHref(
      request.url,
      dancerId,
      result.verificationInvalidated
        ? "bailarin-guardado-requiere-verificacion"
        : "bailarin-guardado",
    ),
  );
}

export function AdministracionBailarinDetalleRouteView({
  loaderData,
  actionData: actionDataOverride,
}: AdministracionBailarinDetalleRouteProps) {
  const actionData =
    actionDataOverride?.status === "error" ? actionDataOverride : undefined;

  return (
    <BailarinDetalleView actionData={actionData} loaderData={loaderData} />
  );
}

export default function AdministracionBailarinDetalleRoute({
  loaderData,
}: AdministracionBailarinDetalleRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionBailarinDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

export { InscriptionsSection };
export type { InscriptionsSectionProps };
