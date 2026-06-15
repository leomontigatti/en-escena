import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId } from "react";
import {
  Controller,
  type FieldPath,
  type SubmitHandler,
  useForm,
  type UseFormReturn,
} from "react-hook-form";
import { Link, redirect, useActionData } from "react-router";
import { z } from "zod";

import { AdminShell } from "@/components/admin/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  adminProfessorCorrectionReasonMessage,
  adminProfessorNotFoundMessage,
  formatAdminProfessorDocument,
  getAdminProfessorParticipationLabel,
  getAdminProfessorParticipationSummary,
  type AdminProfessorParticipationStatus,
} from "@/lib/admin/professors/professors.shared";
import {
  findAdministrativeProfessor,
  type AdministrativeProfessorFieldErrors,
  type AdministrativeProfessorUpdateInput,
  setAdministrativeProfessorActiveState,
  updateAdministrativeProfessor,
} from "@/lib/admin/professors/professors.server";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { getFieldErrors } from "@/lib/shared/form-validation";
import {
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import { type RouteNotificationKey } from "@/lib/shared/route-notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/administracion_.profesores_.$professorId";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Awaited<ReturnType<typeof action>>;
type ProfessorFormValues = AdministrativeProfessorUpdateInput;
type ProfessorStatusFormValues = {
  correctionReason: string;
};
type ProfessorActionError = {
  status: "error";
  message: string;
  fieldErrors: AdministrativeProfessorFieldErrors;
  values: ProfessorFormValues | ProfessorStatusFormValues;
};
type ProfessorFormReturn = UseFormReturn<
  ProfessorFormValues,
  unknown,
  ProfessorFormValues
>;
type ProfessorStatusFormReturn = UseFormReturn<
  ProfessorStatusFormValues,
  unknown,
  ProfessorStatusFormValues
>;
type ProfessorRouteNotification = Extract<
  RouteNotificationKey,
  "profesor-archivado" | "profesor-guardado" | "profesor-reactivado"
>;

type AdministracionProfesorDetalleRouteProps = {
  loaderData: LoaderData;
  actionData?: ActionData;
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

const correctionReasonMaxLength = 500;
const correctionReasonMinLength = 10;
const professorFieldNames = [
  "firstName",
  "lastName",
  "documentType",
  "documentNumber",
  "correctionReason",
] as const satisfies ReadonlyArray<keyof AdministrativeProfessorFieldErrors>;
const emptyProfessorFieldErrors: AdministrativeProfessorFieldErrors = {};

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
    const parsed = buildProfessorStatusSchema(
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

    throw redirect(
      buildDetailNotificationHref(
        request.url,
        professorId,
        intent === "archive-professor"
          ? "profesor-archivado"
          : "profesor-reactivado",
      ),
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

  useServerActionToast(actionData, {
    toastId: "admin-professor-detail:error",
  });

  const professor = loaderData.professor;
  const isEditing =
    loaderData.canEdit && (loaderData.isEditing || Boolean(actionData));
  const submittedEditValues = isProfessorUpdateValues(actionData?.values)
    ? actionData.values
    : null;
  const editFieldErrors = submittedEditValues
    ? actionData?.fieldErrors
    : emptyProfessorFieldErrors;
  const statusFieldErrors =
    !submittedEditValues && actionData?.fieldErrors
      ? actionData.fieldErrors
      : emptyProfessorFieldErrors;
  const editValues = {
    firstName: submittedEditValues?.firstName ?? professor.firstName,
    lastName: submittedEditValues?.lastName ?? professor.lastName,
    documentType:
      submittedEditValues?.documentType ?? professor.documentType ?? "",
    documentNumber:
      submittedEditValues?.documentNumber ?? professor.documentNumber ?? "",
    correctionReason: submittedEditValues?.correctionReason ?? "",
  };
  const statusValues = {
    correctionReason:
      !submittedEditValues && actionData?.values.correctionReason
        ? actionData.values.correctionReason
        : "",
  };
  const editForm = useProfessorEditForm({
    correctionReasonRequired: professor.correctionReasonRequired,
    fieldErrors: editFieldErrors,
    values: editValues,
  });
  const statusForm = useProfessorStatusForm({
    correctionReasonRequired: professor.correctionReasonRequired,
    fieldErrors: statusFieldErrors,
    values: statusValues,
  });
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
          <Button asChild variant="outline">
            <Link to={loaderData.backToList}>
              <ArrowLeft data-icon="inline-start" />
              Volver a Profesores
            </Link>
          </Button>
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

        <div className="grid gap-6 lg:grid-cols-2">
          {isEditing ? (
            <section className="rounded-lg border bg-white p-6">
              <h3 className="text-base font-semibold text-slate-950">
                Editar identidad
              </h3>
              <form
                method="post"
                noValidate
                className="mt-4"
                onSubmit={editForm.handleSubmit}
              >
                <input type="hidden" name="intent" value="update-professor" />
                <FieldGroup>
                  <ProfessorTextField
                    form={editForm.form}
                    label="Nombre"
                    name="firstName"
                  />
                  <ProfessorTextField
                    form={editForm.form}
                    label="Apellido"
                    name="lastName"
                  />
                  <ProfessorDocumentTypeField form={editForm.form} />
                  <ProfessorTextField
                    form={editForm.form}
                    label="Número de documento"
                    name="documentNumber"
                  />
                  <ProfessorCorrectionReasonField
                    form={editForm.form}
                    required={professor.correctionReasonRequired}
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button type="submit">Guardar cambios</Button>
                    <Button asChild variant="outline">
                      <Link to={loaderData.cancelHref}>Cancelar</Link>
                    </Button>
                  </div>
                </FieldGroup>
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
            <form
              method="post"
              noValidate
              className="mt-4"
              onSubmit={statusForm.handleSubmit}
            >
              <input type="hidden" name="intent" value={statusAction.intent} />
              <FieldGroup>
                <ProfessorCorrectionReasonField
                  form={statusForm.form}
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
              </FieldGroup>
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

  return (
    <AdministracionProfesorDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

function useProfessorEditForm({
  correctionReasonRequired,
  fieldErrors = emptyProfessorFieldErrors,
  values,
}: {
  correctionReasonRequired: boolean;
  fieldErrors?: AdministrativeProfessorFieldErrors;
  values: ProfessorFormValues;
}) {
  const form = useForm<ProfessorFormValues, unknown, ProfessorFormValues>({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(buildProfessorUpdateSchema(correctionReasonRequired)),
  });

  useEffect(() => {
    form.reset(values);
  }, [
    form,
    values.correctionReason,
    values.documentNumber,
    values.documentType,
    values.firstName,
    values.lastName,
  ]);

  useApplyServerFieldErrors(form, fieldErrors);

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const submitNativeForm: SubmitHandler<ProfessorFormValues> = () => {
      formElement.submit();
    };

    void form.handleSubmit(submitNativeForm)(event);
  }

  return { form, handleSubmit };
}

function useProfessorStatusForm({
  correctionReasonRequired,
  fieldErrors = emptyProfessorFieldErrors,
  values,
}: {
  correctionReasonRequired: boolean;
  fieldErrors?: AdministrativeProfessorFieldErrors;
  values: ProfessorStatusFormValues;
}) {
  const form = useForm<
    ProfessorStatusFormValues,
    unknown,
    ProfessorStatusFormValues
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(buildProfessorStatusSchema(correctionReasonRequired)),
  });

  useEffect(() => {
    form.reset(values);
  }, [form, values.correctionReason]);

  useApplyServerFieldErrors(form, fieldErrors);

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const submitNativeForm: SubmitHandler<ProfessorStatusFormValues> = () => {
      formElement.submit();
    };

    void form.handleSubmit(submitNativeForm)(event);
  }

  return { form, handleSubmit };
}

function ProfessorTextField({
  form,
  label,
  name,
}: {
  form: ProfessorFormReturn;
  label: string;
  name: "documentNumber" | "firstName" | "lastName";
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldContent>
            <Input
              id={id}
              aria-invalid={fieldState.error ? true : undefined}
              aria-describedby={fieldState.error ? errorId : undefined}
              autoComplete="off"
              {...field}
            />
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function ProfessorDocumentTypeField({ form }: { form: ProfessorFormReturn }) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller
      control={form.control}
      name="documentType"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>Tipo de documento</FieldLabel>
          <FieldContent>
            <Select
              name={field.name}
              value={field.value}
              onValueChange={field.onChange}
            >
              <SelectTrigger
                id={id}
                aria-invalid={fieldState.error ? true : undefined}
                aria-describedby={fieldState.error ? errorId : undefined}
                className="h-10 w-full"
              >
                <SelectValue placeholder="Sin documento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Sin documento</SelectItem>
                <SelectItem value="dni">DNI</SelectItem>
                <SelectItem value="passport">Pasaporte</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function ProfessorCorrectionReasonField<
  TFieldValues extends ProfessorStatusFormValues,
>({
  form,
  required,
}: {
  form: UseFormReturn<TFieldValues, unknown, TFieldValues>;
  required: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <Controller
      control={form.control}
      name={"correctionReason" as FieldPath<TFieldValues>}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>Motivo de corrección</FieldLabel>
          <FieldContent>
            <Textarea
              id={id}
              aria-invalid={fieldState.error ? true : undefined}
              aria-describedby={
                fieldState.error ? `${hintId} ${errorId}` : hintId
              }
              {...field}
            />
            <FieldDescription id={hintId}>
              {required
                ? "Obligatorio entre 10 y 500 caracteres para este Profesor."
                : "Opcional. Si lo completás, usá entre 10 y 500 caracteres."}
            </FieldDescription>
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function buildProfessorUpdateSchema(correctionReasonRequired: boolean) {
  return z
    .object({
      firstName: z.string().trim().min(1, requiredFieldMessage),
      lastName: z.string().trim().min(1, requiredFieldMessage),
      documentType: z.string().trim(),
      documentNumber: z.string().trim(),
      correctionReason: buildCorrectionReasonSchema(correctionReasonRequired),
    })
    .superRefine((values, context) => {
      validateDocumentPair(values.documentType, values.documentNumber, context);
    });
}

function buildProfessorStatusSchema(correctionReasonRequired: boolean) {
  return z.object({
    correctionReason: buildCorrectionReasonSchema(correctionReasonRequired),
  });
}

function buildCorrectionReasonSchema(required: boolean) {
  return z
    .string()
    .trim()
    .superRefine((value, context) => {
      if (value.length === 0) {
        if (required) {
          context.addIssue({
            code: "custom",
            message: adminProfessorCorrectionReasonMessage,
          });
        }

        return;
      }

      if (
        value.length < correctionReasonMinLength ||
        value.length > correctionReasonMaxLength
      ) {
        context.addIssue({
          code: "custom",
          message: adminProfessorCorrectionReasonMessage,
        });
      }
    });
}

function validateDocumentPair(
  documentType: string,
  documentNumber: string,
  context: z.RefinementCtx,
) {
  if (!documentType && !documentNumber) {
    return;
  }

  if (!documentType) {
    context.addIssue({
      code: "custom",
      message: "Seleccioná el tipo de documento.",
      path: ["documentType"],
    });
  }

  if (!documentNumber) {
    context.addIssue({
      code: "custom",
      message: "Ingresá el número de documento.",
      path: ["documentNumber"],
    });
  }

  if (!documentType || !documentNumber) {
    return;
  }

  if (!isDocumentType(documentType)) {
    context.addIssue({
      code: "custom",
      message: "Seleccioná un tipo de documento válido.",
      path: ["documentType"],
    });

    return;
  }

  if (documentType !== "dni") {
    return;
  }

  const normalizedDni = documentNumber.replace(/[.\s-]+/g, "");

  if (!/^\d+$/.test(normalizedDni)) {
    context.addIssue({
      code: "custom",
      message: "Ingresá un DNI válido.",
      path: ["documentNumber"],
    });
  }
}

function isDocumentType(value: string): value is "dni" | "other" | "passport" {
  return value === "dni" || value === "passport" || value === "other";
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

function buildBackToListHref(requestUrl: string) {
  const url = new URL(requestUrl);
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("modo");
  searchParams.delete("evento");
  searchParams.delete("notificacion");
  const search = searchParams.toString();

  return `/administracion/profesores${search.length > 0 ? `?${search}` : ""}`;
}

function buildModeHref(url: URL, mode: "editar" | null) {
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("evento");
  searchParams.delete("notificacion");

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

function buildDetailNotificationHref(
  requestUrl: string,
  professorId: string,
  notification: ProfessorRouteNotification,
) {
  const url = new URL(requestUrl);
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("modo");
  searchParams.delete("evento");
  searchParams.delete("notificacion");
  searchParams.set("notificacion", notification);

  return `/administracion/profesores/${professorId}?${searchParams.toString()}`;
}

function readProfessorIdFromPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return segments.at(-1) ?? "";
}

function readProfessorStatusValues(
  formData: FormData,
): ProfessorStatusFormValues {
  return {
    correctionReason: readFormString(formData, "correctionReason"),
  };
}

function readProfessorUpdateValues(formData: FormData): ProfessorFormValues {
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
): values is ProfessorFormValues {
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
