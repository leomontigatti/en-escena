import { getFieldErrors } from "@/lib/shared/form-validation";
import { redirect, useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  buildBackToListHref,
  buildDetailNotificationHref,
  buildModeHref,
  buildProfessorActionError,
  buildProfessorReasonSchema,
  buildProfessorUpdateSchema,
  professorFieldNames,
  readProfessorReasonValues,
  readProfessorUpdateValues,
  type ProfessorActionError,
  type ProfessorDetailLoaderData,
} from "@/lib/admin/professors/professor-detail.shared";
import { AdministracionProfesorDetalleRouteView as ProfesorDetalleView } from "@/lib/admin/professors/professor-detail-view";
import {
  findAdministrativeProfessor,
  setAdministrativeProfessorActiveState,
  updateAdministrativeProfessor,
} from "@/lib/admin/professors/professors.server";
import { adminProfessorNotFoundMessage } from "@/lib/admin/professors/professors.shared";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";

import type { Route } from "./+types/administracion.profesores_.$professorId";

type LoaderData = ProfessorDetailLoaderData;
type ActionData = Awaited<ReturnType<typeof action>>;

type AdministracionProfesorDetalleRouteProps = {
  loaderData: LoaderData;
  actionData?: ActionData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Detalle profesor | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Profesores", to: "/administracion/profesores" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      const professor = data?.professor;
      return professor
        ? { label: `${professor.firstName} ${professor.lastName}` }
        : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({
  request,
  params,
}: Route.LoaderArgs): Promise<LoaderData> {
  const user = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const professorId = params.professorId;

  if (!professorId) {
    throw new Response(adminProfessorNotFoundMessage, { status: 404 });
  }

  const professor = await findAdministrativeProfessor({
    professorId,
    selectedEventId: eventContext.selectedEventId,
  });

  if (!professor) {
    throw new Response(adminProfessorNotFoundMessage, { status: 404 });
  }

  const url = new URL(request.url);

  return {
    canEdit: user.role === "admin",
    selectedEventId: eventContext.selectedEventId,
    professor,
    backToList: buildBackToListHref(request.url),
    editHref: buildModeHref(url, "editar"),
    cancelHref: buildModeHref(url, null),
    isEditing:
      user.role === "admin" && url.searchParams.get("modo") === "editar",
  };
}

export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<ProfessorActionError | never> {
  const adminUser = await requireAdminUser(request);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const professorId = params.professorId;

  if (!professorId) {
    throw new Response(adminProfessorNotFoundMessage, { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  const professor = await findAdministrativeProfessor({
    professorId,
    selectedEventId: eventContext.selectedEventId,
  });

  if (!professor) {
    throw new Response(adminProfessorNotFoundMessage, { status: 404 });
  }

  if (intent === "archive-professor" || intent === "reactivate-professor") {
    const values = readProfessorReasonValues(formData);
    const parsed = buildProfessorReasonSchema(
      professor.correctionReasonRequired,
    ).safeParse(values);

    if (!parsed.success) {
      return buildProfessorActionError(
        "Revisá los campos marcados.",
        getFieldErrors(parsed.error, professorFieldNames),
        values,
      );
    }

    const result = await setAdministrativeProfessorActiveState({
      action: intent === "archive-professor" ? "archive" : "reactivate",
      adminUserId: adminUser.id,
      professorId,
      selectedEventId: eventContext.selectedEventId,
      correctionReason: parsed.data.correctionReason,
    });

    if (!result.ok) {
      return buildProfessorActionError(
        result.message,
        result.fieldErrors,
        values,
      );
    }

    const notification =
      intent === "archive-professor"
        ? "profesor-archivado"
        : "profesor-reactivado";

    throw redirect(
      buildDetailNotificationHref(request.url, professorId, notification),
    );
  }

  const values = readProfessorUpdateValues(formData);
  const parsed = buildProfessorUpdateSchema(
    professor.correctionReasonRequired,
  ).safeParse(values);

  if (!parsed.success) {
    return buildProfessorActionError(
      "Revisá los campos marcados.",
      getFieldErrors(parsed.error, professorFieldNames),
      values,
    );
  }

  const result = await updateAdministrativeProfessor({
    adminUserId: adminUser.id,
    professorId,
    selectedEventId: eventContext.selectedEventId,
    values: parsed.data,
  });

  if (!result.ok) {
    return buildProfessorActionError(
      result.message,
      result.fieldErrors,
      result.values,
    );
  }

  throw redirect(
    buildDetailNotificationHref(request.url, professorId, "profesor-guardado"),
  );
}

export function AdministracionProfesorDetalleRouteView({
  loaderData,
  actionData: actionDataOverride,
}: AdministracionProfesorDetalleRouteProps) {
  const actionData =
    actionDataOverride?.status === "error" ? actionDataOverride : undefined;

  return (
    <ProfesorDetalleView actionData={actionData} loaderData={loaderData} />
  );
}

export default function AdministracionProfesorDetalleRoute({
  loaderData,
}: AdministracionProfesorDetalleRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionProfesorDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
