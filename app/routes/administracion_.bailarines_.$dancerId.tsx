import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link, redirect, useActionData, useSearchParams } from "react-router";

import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  adminDancerCorrectionReasonMessage,
  adminDancerNotFoundMessage,
  adminDancerSavedSearchParam,
  adminDancerSavedSuccessMessage,
  formatAdminDancerBirthDate,
  formatAdminDancerDocument,
  getAdminDancerIdentificationBadgeVariant,
  getAdminDancerIdentificationLabel,
  getAdminDancerParticipationBadgeVariant,
  getAdminDancerParticipationLabel,
  getAdminDancerParticipationSummary,
  type AdminDancerIdentificationStatus,
  type AdminDancerParticipationStatus,
} from "@/lib/admin-dancers.shared";
import {
  findAdministrativeDancer,
  type AdministrativeDancerFieldErrors,
  type AdministrativeDancerStatusInput,
  type AdministrativeDancerUpdateInput,
  setAdministrativeDancerActiveState,
  updateAdministrativeDancer,
} from "@/lib/admin-dancers.server";
import { loadAdminEventContext } from "@/lib/admin-event-context.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/internal-access.server";

import type { Route } from "./+types/administracion_.bailarines_.$dancerId";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Awaited<ReturnType<typeof action>>;
type DancerActionError = {
  status: "error";
  message: string;
  fieldErrors: AdministrativeDancerFieldErrors;
  values: AdministrativeDancerUpdateInput | AdministrativeDancerStatusInput;
};

type AdministracionBailarinDetalleRouteProps = {
  loaderData: LoaderData;
  actionData?: ActionData;
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

export const meta: Route.MetaFunction = () => [
  { title: "Bailarín | Panel de administración | En Escena" },
];

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
    email: user.email,
    eventOptions: eventContext.events,
    selectedEventId: eventContext.selectedEventId,
    dancer,
    backToList: buildBackToListHref(request.url),
    editHref: buildModeHref(url, dancerId, "editar"),
    cancelHref: buildModeHref(url, dancerId, null),
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

  const dancerId = params.dancerId;

  if (!dancerId) {
    throw new Response(adminDancerNotFoundMessage, { status: 404 });
  }

  const formData = await request.formData();
  const intent = readFormString(formData, "intent");
  const dancer = await findAdministrativeDancer({
    dancerId,
    selectedEventId: eventContext.selectedEventId,
  });

  if (!dancer) {
    throw new Response(adminDancerNotFoundMessage, { status: 404 });
  }

  if (intent === "archive-dancer" || intent === "reactivate-dancer") {
    const values = readDancerStatusValues(formData);

    if (
      isInvalidCorrectionReason(
        dancer.correctionReasonRequired,
        values.correctionReason.trim(),
      )
    ) {
      return buildDancerActionError(
        "Revisá los campos marcados.",
        {
          correctionReason: adminDancerCorrectionReasonMessage,
        },
        values,
      );
    }

    const result = await setAdministrativeDancerActiveState({
      action: intent === "archive-dancer" ? "archive" : "reactivate",
      adminUserId: adminUser.id,
      dancerId,
      selectedEventId: eventContext.selectedEventId,
      correctionReason: values.correctionReason,
    });

    if (!result.ok) {
      return buildDancerActionError(
        result.message,
        result.fieldErrors,
        result.values,
      );
    }

    throw redirect(buildSavedDetailHref(request.url, dancerId));
  }

  const values = readDancerUpdateValues(formData);

  if (
    isInvalidCorrectionReason(
      dancer.correctionReasonRequired,
      values.correctionReason.trim(),
    )
  ) {
    return buildDancerActionError(
      "Revisá los campos marcados.",
      {
        correctionReason: adminDancerCorrectionReasonMessage,
      },
      values,
    );
  }

  const result = await updateAdministrativeDancer({
    adminUserId: adminUser.id,
    dancerId,
    selectedEventId: eventContext.selectedEventId,
    values,
  });

  if (!result.ok) {
    return buildDancerActionError(
      result.message,
      result.fieldErrors,
      result.values,
    );
  }

  throw redirect(buildSavedDetailHref(request.url, dancerId));
}

export function AdministracionBailarinDetalleRouteView({
  loaderData,
  actionData: actionDataOverride,
}: AdministracionBailarinDetalleRouteProps) {
  const actionData =
    actionDataOverride?.status === "error" ? actionDataOverride : undefined;
  const dancer = loaderData.dancer;
  const isEditing =
    loaderData.canEdit && (loaderData.isEditing || Boolean(actionData));
  const submittedEditValues = isDancerUpdateValues(actionData?.values)
    ? actionData.values
    : null;
  const editFieldErrors = submittedEditValues
    ? actionData?.fieldErrors
    : undefined;
  const statusFieldErrors = actionData?.fieldErrors;
  const values = {
    firstName: submittedEditValues?.firstName ?? dancer.firstName,
    lastName: submittedEditValues?.lastName ?? dancer.lastName,
    birthDate: submittedEditValues?.birthDate ?? dancer.birthDate,
    documentType:
      submittedEditValues?.documentType ?? dancer.documentType ?? "",
    documentNumber:
      submittedEditValues?.documentNumber ?? dancer.documentNumber ?? "",
    correctionReason: actionData?.values.correctionReason ?? "",
  };
  const birthDateMayNeedRecalculation =
    isEditing && dancer.participatedInAnyEvent;
  const statusAction = dancer.active
    ? {
        description:
          "Archivá este Bailarín para que deje de aparecer en futuras selecciones del portal sin desvincular sus coreografías existentes.",
        intent: "archive-dancer" as const,
        label: "Archivar Bailarín",
      }
    : {
        description:
          "Reactivá este Bailarín para que vuelva a aparecer en futuras selecciones del portal.",
        intent: "reactivate-dancer" as const,
        label: "Reactivar Bailarín",
      };

  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.eventOptions}
      selectedEventId={loaderData.selectedEventId}
      title="Bailarín"
    >
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to={loaderData.backToList}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Volver a Bailarines
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
              {dancer.lastName}, {dancer.firstName}
            </h2>
            <Badge variant={dancer.active ? "default" : "secondary"}>
              {dancer.active ? "Activo" : "Archivado"}
            </Badge>
            <ParticipationBadge
              participationStatus={dancer.participationStatus}
            />
            <IdentificationBadge
              identificationStatus={dancer.identificationStatus}
            />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {loaderData.canEdit
              ? "Ficha administrativa con corrección auditada para soporte."
              : "Ficha administrativa de solo lectura para soporte y auditoría."}
          </p>
        </div>

        {loaderData.successMessage ? (
          <Notice variant="success">{loaderData.successMessage}</Notice>
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
                <input type="hidden" name="intent" value="update-dancer" />
                <TextField
                  id="bailarin-first-name"
                  label="Nombre"
                  name="firstName"
                  value={values.firstName}
                  error={editFieldErrors?.firstName}
                  required
                />
                <TextField
                  id="bailarin-last-name"
                  label="Apellido"
                  name="lastName"
                  value={values.lastName}
                  error={editFieldErrors?.lastName}
                  required
                />
                <DateField
                  id="bailarin-birth-date"
                  label="Fecha de nacimiento"
                  name="birthDate"
                  value={values.birthDate}
                  error={editFieldErrors?.birthDate}
                  required
                />
                <DocumentTypeField
                  value={values.documentType}
                  error={editFieldErrors?.documentType}
                />
                <TextField
                  id="bailarin-document-number"
                  label="Número de documento"
                  name="documentNumber"
                  value={values.documentNumber}
                  error={editFieldErrors?.documentNumber}
                />
                <CorrectionReasonField
                  value={values.correctionReason}
                  error={statusFieldErrors?.correctionReason}
                  required={dancer.correctionReasonRequired}
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
              <DetailRow label="Nombre">{dancer.firstName}</DetailRow>
              <DetailRow label="Apellido">{dancer.lastName}</DetailRow>
              <DetailRow label="Fecha de nacimiento">
                {formatAdminDancerBirthDate(dancer.birthDate)}
              </DetailRow>
              <DetailRow label="Documento">
                {formatAdminDancerDocument(dancer)}
              </DetailRow>
              <DetailRow label="Estado de identificación">
                {getAdminDancerIdentificationLabel(dancer.identificationStatus)}
              </DetailRow>
            </ReadOnlyCard>
          )}

          <ReadOnlyCard title="Academia">
            <DetailRow label="Academia">{dancer.academy.name}</DetailRow>
            <DetailRow label="Contacto">{dancer.academy.contactName}</DetailRow>
            <DetailRow label="Email">{dancer.academy.email}</DetailRow>
            <DetailRow label="Teléfono">{dancer.academy.phone}</DetailRow>
          </ReadOnlyCard>
        </div>

        <ReadOnlyCard title="Participación">
          <DetailRow label="Evento de trabajo">
            {getAdminDancerParticipationSummary(dancer.participationStatus)}
          </DetailRow>
          {dancer.choreographyNames.length > 0 ? (
            <DetailRow label="Coreografías">
              <ul className="space-y-1">
                {dancer.choreographyNames.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </DetailRow>
          ) : null}
          {isEditing && dancer.correctionReasonRequired ? (
            <p className="mt-4 text-sm leading-6 text-amber-700">
              Este Bailarín ya participó y requiere un motivo de corrección para
              guardar cambios o cambiar su estado.
            </p>
          ) : null}
          {birthDateMayNeedRecalculation ? (
            <p className="mt-4 text-sm leading-6 text-amber-700">
              Si cambiás la fecha de nacimiento, las coreografías vinculadas
              pueden requerir recalcular categoría desde el flujo de
              Coreografías.
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
                required={dancer.correctionReasonRequired}
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  variant={
                    statusAction.intent === "archive-dancer"
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
            {dateTimeFormatter.format(dancer.createdAt)}
          </DetailRow>
          <DetailRow label="Actualizado">
            {dateTimeFormatter.format(dancer.updatedAt)}
          </DetailRow>
        </ReadOnlyCard>
      </section>
    </AdminShell>
  );
}

export default function AdministracionBailarinDetalleRoute({
  loaderData,
}: AdministracionBailarinDetalleRouteProps) {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  return (
    <AdministracionBailarinDetalleRouteView
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
  participationStatus: AdminDancerParticipationStatus;
}) {
  return (
    <Badge
      variant={getAdminDancerParticipationBadgeVariant(participationStatus)}
    >
      {getAdminDancerParticipationLabel(participationStatus)}
    </Badge>
  );
}

function IdentificationBadge({
  identificationStatus,
}: {
  identificationStatus: AdminDancerIdentificationStatus;
}) {
  return (
    <Badge
      variant={getAdminDancerIdentificationBadgeVariant(identificationStatus)}
    >
      {getAdminDancerIdentificationLabel(identificationStatus)}
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
  const errorId = error ? "bailarin-document-type-error" : undefined;

  return (
    <div className="grid gap-2">
      <label
        htmlFor="bailarin-document-type"
        className="text-sm font-medium text-slate-900"
      >
        Tipo de documento
      </label>
      <select
        id="bailarin-document-type"
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
  const errorId = error ? "bailarin-correction-reason-error" : undefined;
  const hintId = "bailarin-correction-reason-hint";

  return (
    <div className="grid gap-2">
      <label
        htmlFor="bailarin-correction-reason"
        className="text-sm font-medium text-slate-900"
      >
        Motivo de corrección
      </label>
      <textarea
        id="bailarin-correction-reason"
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
          ? "Obligatorio entre 10 y 500 caracteres para este Bailarín."
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

function DateField({
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
        type="date"
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
  const classNameByVariant = {
    error:
      "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800",
    success:
      "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800",
  } satisfies Record<typeof variant, string>;

  return <div className={classNameByVariant[variant]}>{children}</div>;
}

function buildBackToListHref(requestUrl: string) {
  const url = new URL(requestUrl);
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete(adminDancerSavedSearchParam);
  searchParams.delete("modo");
  const search = searchParams.toString();

  return `/administracion/bailarines${search.length > 0 ? `?${search}` : ""}`;
}

function buildModeHref(url: URL, dancerId: string, mode: "editar" | null) {
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete(adminDancerSavedSearchParam);

  if (mode === null) {
    searchParams.delete("modo");
  } else {
    searchParams.set("modo", mode);
  }

  const search = searchParams.toString();

  return `/administracion/bailarines/${dancerId}${
    search.length > 0 ? `?${search}` : ""
  }`;
}

function buildSavedDetailHref(requestUrl: string, dancerId: string) {
  const url = new URL(requestUrl);
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("modo");
  searchParams.set(adminDancerSavedSearchParam, "1");

  return `/administracion/bailarines/${dancerId}?${searchParams.toString()}`;
}

function readSavedSuccessMessage(searchParams: URLSearchParams) {
  return searchParams.get(adminDancerSavedSearchParam) === "1"
    ? adminDancerSavedSuccessMessage
    : null;
}

function readDancerStatusValues(
  formData: FormData,
): AdministrativeDancerStatusInput {
  return {
    correctionReason: readFormString(formData, "correctionReason"),
  };
}

function readDancerUpdateValues(
  formData: FormData,
): AdministrativeDancerUpdateInput {
  return {
    firstName: readFormString(formData, "firstName"),
    lastName: readFormString(formData, "lastName"),
    birthDate: readFormString(formData, "birthDate"),
    documentType: readFormString(formData, "documentType"),
    documentNumber: readFormString(formData, "documentNumber"),
    correctionReason: readFormString(formData, "correctionReason"),
  };
}

function buildDancerActionError(
  message: string,
  fieldErrors: DancerActionError["fieldErrors"],
  values: DancerActionError["values"],
): DancerActionError {
  return {
    status: "error",
    message,
    fieldErrors,
    values,
  };
}

function isDancerUpdateValues(
  values: DancerActionError["values"] | undefined,
): values is AdministrativeDancerUpdateInput {
  return (
    values !== undefined &&
    "firstName" in values &&
    "lastName" in values &&
    "birthDate" in values &&
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
