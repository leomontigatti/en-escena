import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link, redirect, useActionData, useSearchParams } from "react-router";

import { AdminShell } from "@/components/admin/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  adminProfessorCorrectionReasonMessage,
  adminProfessorNotFoundMessage,
  adminProfessorSavedSearchParam,
  adminProfessorSavedSuccessMessage,
  formatAdminProfessorDocument,
  getAdminProfessorParticipationLabel,
  getAdminProfessorParticipationSummary,
  type AdminProfessorParticipationStatus,
} from "@/lib/admin/professors/professors.shared";
import {
  findAdministrativeProfessor,
  setAdministrativeProfessorActiveState,
  updateAdministrativeProfessor,
} from "@/lib/admin/professors/professors.server";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";

import type { Route } from "./+types/administracion_.profesores_.$professorId";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Awaited<ReturnType<typeof action>>;
type ProfessorUpdateValues = {
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  correctionReason: string;
};
type ProfessorStatusValues = {
  correctionReason: string;
};
type ProfessorActionError = {
  status: "error";
  message: string;
  fieldErrors: Partial<
    Record<
      | "firstName"
      | "lastName"
      | "documentType"
      | "documentNumber"
      | "correctionReason",
      string
    >
  >;
  values: ProfessorUpdateValues | ProfessorStatusValues;
};

type AdministracionProfesorDetalleRouteProps = {
  loaderData: LoaderData;
  actionData?: ActionData;
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

export const meta: Route.MetaFunction = () => [
  { title: "Profesor | Panel de administración | En Escena" },
];

export async function loader({ request, params }: Route.LoaderArgs) {
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
    email: user.email,
    eventOptions: eventContext.events,
    selectedEventId: eventContext.selectedEventId,
    professor,
    backToList: buildBackToListHref(request.url),
    editHref: buildModeHref(url, "editar"),
    cancelHref: buildModeHref(url, null),
    successMessage: readSavedSuccessMessage(url.searchParams),
    isEditing:
      user.role === "admin" && url.searchParams.get("modo") === "editar",
  };
}

export async function action({ request, params }: Route.ActionArgs) {
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
  const intent = readFormString(formData, "intent");
  const professor = await findAdministrativeProfessor({
    professorId,
    selectedEventId: eventContext.selectedEventId,
  });

  if (!professor) {
    throw new Response(adminProfessorNotFoundMessage, { status: 404 });
  }

  if (intent === "archive-professor" || intent === "reactivate-professor") {
    const values = readProfessorStatusValues(formData);

    if (
      isInvalidCorrectionReason(
        professor.correctionReasonRequired,
        values.correctionReason.trim(),
      )
    ) {
      return buildProfessorActionError(
        "Revisá los campos marcados.",
        {
          correctionReason: adminProfessorCorrectionReasonMessage,
        },
        values,
      );
    }

    const result = await setAdministrativeProfessorActiveState({
      action: intent === "archive-professor" ? "archive" : "reactivate",
      adminUserId: adminUser.id,
      professorId,
      selectedEventId: eventContext.selectedEventId,
      correctionReason: values.correctionReason,
    });

    if (!result.ok) {
      return buildProfessorActionError(
        result.message,
        result.fieldErrors,
        values,
      );
    }

    throw redirect(buildSavedDetailHref(request.url, professorId));
  }

  const values = readProfessorUpdateValues(formData);

  if (
    isInvalidCorrectionReason(
      professor.correctionReasonRequired,
      values.correctionReason.trim(),
    )
  ) {
    return buildProfessorActionError(
      "Revisá los campos marcados.",
      {
        correctionReason: adminProfessorCorrectionReasonMessage,
      },
      values,
    );
  }

  const result = await updateAdministrativeProfessor({
    adminUserId: adminUser.id,
    professorId,
    selectedEventId: eventContext.selectedEventId,
    values,
  });

  if (!result.ok) {
    return buildProfessorActionError(
      result.message,
      result.fieldErrors,
      result.values,
    );
  }

  throw redirect(buildSavedDetailHref(request.url, professorId));
}

export function AdministracionProfesorDetalleRouteView({
  loaderData,
  actionData: actionDataOverride,
}: AdministracionProfesorDetalleRouteProps) {
  const actionData =
    actionDataOverride?.status === "error" ? actionDataOverride : undefined;
  const professor = loaderData.professor;
  const isEditing =
    loaderData.canEdit && (loaderData.isEditing || Boolean(actionData));
  const successMessage = loaderData.successMessage;
  const submittedEditValues = isProfessorUpdateValues(actionData?.values)
    ? actionData.values
    : null;
  const editFieldErrors = submittedEditValues
    ? actionData?.fieldErrors
    : undefined;
  const statusFieldErrors = actionData?.fieldErrors;
  const values = {
    firstName: submittedEditValues?.firstName ?? professor.firstName,
    lastName: submittedEditValues?.lastName ?? professor.lastName,
    documentType:
      submittedEditValues?.documentType ?? professor.documentType ?? "",
    documentNumber:
      submittedEditValues?.documentNumber ?? professor.documentNumber ?? "",
    correctionReason: actionData?.values.correctionReason ?? "",
  };
  const statusAction = professor.active
    ? {
        description:
          "Archivá este Profesor para que deje de aparecer en futuras selecciones del portal sin desvincular sus coreografías existentes.",
        intent: "archive-professor" as const,
        label: "Archivar Profesor",
      }
    : {
        description:
          "Reactivá este Profesor para que vuelva a aparecer en futuras selecciones del portal.",
        intent: "reactivate-professor" as const,
        label: "Reactivar Profesor",
      };

  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.eventOptions}
      selectedEventId={loaderData.selectedEventId}
      title="Profesor"
    >
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to={loaderData.backToList}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Volver a Profesores
          </Link>
          {loaderData.canEdit && !isEditing ? (
            <Button asChild>
              <Link to={loaderData.editHref}>Editar</Link>
            </Button>
          ) : null}
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-950">
              {professor.lastName}, {professor.firstName}
            </h2>
            <Badge variant={professor.active ? "default" : "secondary"}>
              {professor.active ? "Activo" : "Archivado"}
            </Badge>
            <ParticipationBadge
              participationStatus={professor.participationStatus}
            />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {loaderData.canEdit
              ? "Ficha administrativa con corrección auditada para soporte."
              : "Ficha administrativa de solo lectura para soporte y auditoría."}
          </p>
        </div>

        {successMessage ? (
          <Notice variant="success">{successMessage}</Notice>
        ) : null}

        {actionData?.status === "error" ? (
          <Notice variant="error">{actionData.message}</Notice>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          {isEditing ? (
            <section className="rounded-lg border bg-white p-6">
              <h3 className="text-base font-semibold text-slate-950">
                Editar identidad
              </h3>
              <form method="post" className="mt-4 space-y-4">
                <input type="hidden" name="intent" value="update-professor" />
                <TextField
                  id="profesor-first-name"
                  label="Nombre"
                  name="firstName"
                  value={values.firstName}
                  error={editFieldErrors?.firstName}
                  required
                />
                <TextField
                  id="profesor-last-name"
                  label="Apellido"
                  name="lastName"
                  value={values.lastName}
                  error={editFieldErrors?.lastName}
                  required
                />
                <DocumentTypeField
                  value={values.documentType}
                  error={editFieldErrors?.documentType}
                />
                <TextField
                  id="profesor-document-number"
                  label="Número de documento"
                  name="documentNumber"
                  value={values.documentNumber}
                  error={editFieldErrors?.documentNumber}
                />
                <CorrectionReasonField
                  value={values.correctionReason}
                  error={statusFieldErrors?.correctionReason}
                  required={professor.correctionReasonRequired}
                />
                <div className="flex flex-wrap gap-3">
                  <Button type="submit">Guardar cambios</Button>
                  <Button asChild variant="outline">
                    <Link to={loaderData.cancelHref}>Cancelar</Link>
                  </Button>
                </div>
              </form>
            </section>
          ) : (
            <ReadOnlyCard title="Identidad">
              <DetailRow label="Nombre">{professor.firstName}</DetailRow>
              <DetailRow label="Apellido">{professor.lastName}</DetailRow>
              <DetailRow label="Documento">
                {formatAdminProfessorDocument(professor)}
              </DetailRow>
            </ReadOnlyCard>
          )}

          <ReadOnlyCard title="Academia">
            <DetailRow label="Academia">{professor.academy.name}</DetailRow>
            <DetailRow label="Contacto">
              {professor.academy.contactName}
            </DetailRow>
            <DetailRow label="Email">{professor.academy.email}</DetailRow>
            <DetailRow label="Teléfono">{professor.academy.phone}</DetailRow>
          </ReadOnlyCard>
        </div>

        <ReadOnlyCard title="Participación">
          <DetailRow label="Evento activo">
            {getAdminProfessorParticipationSummary(
              professor.participationStatus,
            )}
          </DetailRow>
          {professor.choreographyNames.length > 0 ? (
            <DetailRow label="Coreografías">
              <ul className="space-y-1">
                {professor.choreographyNames.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </DetailRow>
          ) : null}
          {isEditing && professor.correctionReasonRequired ? (
            <p className="mt-4 text-sm leading-6 text-amber-700">
              Este Profesor ya participó y requiere un motivo de corrección para
              guardar cambios o cambiar su estado.
            </p>
          ) : null}
        </ReadOnlyCard>

        {loaderData.canEdit && isEditing ? (
          <section className="rounded-lg border bg-white p-6">
            <h3 className="text-base font-semibold text-slate-950">Estado</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {statusAction.description}
            </p>
            <form method="post" className="mt-4 space-y-4">
              <input type="hidden" name="intent" value={statusAction.intent} />
              <CorrectionReasonField
                value={values.correctionReason}
                error={statusFieldErrors?.correctionReason}
                required={professor.correctionReasonRequired}
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  variant={
                    statusAction.intent === "archive-professor"
                      ? "outline"
                      : "default"
                  }
                >
                  {statusAction.label}
                </Button>
                <Button asChild variant="outline">
                  <Link to={loaderData.cancelHref}>Cancelar</Link>
                </Button>
              </div>
            </form>
          </section>
        ) : null}

        <ReadOnlyCard title="Trazabilidad">
          <DetailRow label="Creado">
            {dateTimeFormatter.format(professor.createdAt)}
          </DetailRow>
          <DetailRow label="Actualizado">
            {dateTimeFormatter.format(professor.updatedAt)}
          </DetailRow>
        </ReadOnlyCard>
      </section>
    </AdminShell>
  );
}

export default function AdministracionProfesorDetalleRoute({
  loaderData,
}: AdministracionProfesorDetalleRouteProps) {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  return (
    <AdministracionProfesorDetalleRouteView
      loaderData={{
        ...loaderData,
        successMessage:
          readSavedSuccessMessage(searchParams) ?? loaderData.successMessage,
      }}
      actionData={actionData}
    />
  );
}

function ReadOnlyCard({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border bg-white p-6">
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <dl className="mt-4 space-y-4">{children}</dl>
    </section>
  );
}

function DetailRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-slate-600">{label}</dt>
      <dd className="mt-1 text-sm text-slate-950">{children}</dd>
    </div>
  );
}

function ParticipationBadge({
  participationStatus,
}: {
  participationStatus: AdminProfessorParticipationStatus;
}) {
  const variant =
    participationStatus === "participating" ? "outline" : "secondary";

  return (
    <Badge variant={variant}>
      {getAdminProfessorParticipationLabel(participationStatus)}
    </Badge>
  );
}

function DocumentTypeField({
  error,
  value,
}: {
  error?: string;
  value: string;
}) {
  const errorId = error ? "profesor-document-type-error" : undefined;

  return (
    <div className="grid gap-2">
      <label
        htmlFor="profesor-document-type"
        className="text-sm font-medium text-slate-900"
      >
        Tipo de documento
      </label>
      <select
        id="profesor-document-type"
        name="documentType"
        defaultValue={value}
        aria-describedby={errorId}
        aria-invalid={error ? true : undefined}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring aria-[invalid=true]:border-red-500"
      >
        <option value="">Sin documento</option>
        <option value="dni">DNI</option>
        <option value="passport">Pasaporte</option>
        <option value="other">Otro</option>
      </select>
      {error ? (
        <p id={errorId} className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CorrectionReasonField({
  error,
  required,
  value,
}: {
  error?: string;
  required: boolean;
  value: string;
}) {
  const errorId = error ? "profesor-correction-reason-error" : undefined;
  const hintId = "profesor-correction-reason-hint";

  return (
    <div className="grid gap-2">
      <label
        htmlFor="profesor-correction-reason"
        className="text-sm font-medium text-slate-900"
      >
        Motivo de corrección
      </label>
      <textarea
        id="profesor-correction-reason"
        name="correctionReason"
        defaultValue={value}
        minLength={required ? 10 : undefined}
        maxLength={500}
        required={required}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        aria-invalid={error ? true : undefined}
        className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring aria-[invalid=true]:border-red-500"
      />
      <p id={hintId} className="text-xs text-slate-500">
        {required
          ? "Obligatorio entre 10 y 500 caracteres para este Profesor."
          : "Opcional. Si lo completás, usá entre 10 y 500 caracteres."}
      </p>
      {error ? (
        <p id={errorId} className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TextField({
  error,
  id,
  label,
  name,
  required = false,
  value,
}: {
  error?: string;
  id: string;
  label: string;
  name: string;
  required?: boolean;
  value: string;
}) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium text-slate-900">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        required={required}
        defaultValue={value}
        aria-describedby={errorId}
        aria-invalid={error ? true : undefined}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring aria-[invalid=true]:border-red-500"
      />
      {error ? (
        <p id={errorId} className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Notice({
  children,
  variant,
}: {
  children: ReactNode;
  variant: "error" | "success";
}) {
  const className =
    variant === "success"
      ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
      : "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800";

  return <div className={className}>{children}</div>;
}

function buildBackToListHref(requestUrl: string) {
  const url = new URL(requestUrl);
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete(adminProfessorSavedSearchParam);
  searchParams.delete("modo");
  searchParams.delete("evento");
  const search = searchParams.toString();

  return `/administracion/profesores${search.length > 0 ? `?${search}` : ""}`;
}

function buildModeHref(url: URL, mode: "editar" | null) {
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete(adminProfessorSavedSearchParam);
  searchParams.delete("evento");

  if (mode === null) {
    searchParams.delete("modo");
  } else {
    searchParams.set("modo", mode);
  }

  const search = searchParams.toString();

  return `/administracion/profesores/${readProfessorIdFromPath(url.pathname)}${
    search.length > 0 ? `?${search}` : ""
  }`;
}

function buildSavedDetailHref(requestUrl: string, professorId: string) {
  const url = new URL(requestUrl);
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("modo");
  searchParams.delete("evento");
  searchParams.set(adminProfessorSavedSearchParam, "1");

  return `/administracion/profesores/${professorId}?${searchParams.toString()}`;
}

function readSavedSuccessMessage(searchParams: URLSearchParams) {
  return searchParams.get(adminProfessorSavedSearchParam) === "1"
    ? adminProfessorSavedSuccessMessage
    : null;
}

function readProfessorIdFromPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return segments.at(-1) ?? "";
}

function readProfessorStatusValues(formData: FormData): ProfessorStatusValues {
  return {
    correctionReason: readFormString(formData, "correctionReason"),
  };
}

function readProfessorUpdateValues(formData: FormData): ProfessorUpdateValues {
  return {
    firstName: readFormString(formData, "firstName"),
    lastName: readFormString(formData, "lastName"),
    documentType: readFormString(formData, "documentType"),
    documentNumber: readFormString(formData, "documentNumber"),
    correctionReason: readFormString(formData, "correctionReason"),
  };
}

function buildProfessorActionError(
  message: string,
  fieldErrors: ProfessorActionError["fieldErrors"],
  values: ProfessorActionError["values"],
): ProfessorActionError {
  return {
    status: "error",
    message,
    fieldErrors,
    values,
  };
}

function isProfessorUpdateValues(
  values: ProfessorActionError["values"] | undefined,
): values is ProfessorUpdateValues {
  return (
    values !== undefined &&
    "firstName" in values &&
    "lastName" in values &&
    "documentType" in values &&
    "documentNumber" in values
  );
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function isInvalidCorrectionReason(required: boolean, value: string) {
  if (value.length === 0) {
    return required;
  }

  return value.length < 10 || value.length > 500;
}
