import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId } from "react";
import {
  Controller,
  type FieldPath,
  useForm,
  type UseFormReturn,
} from "react-hook-form";
import { Link, redirect, useActionData } from "react-router";
import { z } from "zod";

import { AdminShell } from "@/components/admin/shell";
import { DateOnlyField } from "@/components/shared/date-only-field";
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
  adminDancerCorrectionReasonMessage,
  adminDancerNotFoundMessage,
  formatAdminDancerBirthDate,
  formatAdminDancerDocument,
  getAdminDancerIdentificationBadgeVariant,
  getAdminDancerIdentificationLabel,
  getAdminDancerParticipationBadgeVariant,
  getAdminDancerParticipationLabel,
  getAdminDancerParticipationSummary,
  type AdminDancerIdentificationStatus,
  type AdminDancerParticipationStatus,
} from "@/lib/admin/dancers/dancers.shared";
import {
  findAdministrativeDancer,
  type AdministrativeDancerFieldErrors,
  type AdministrativeDancerStatusInput,
  type AdministrativeDancerUpdateInput,
  setAdministrativeDancerActiveState,
  updateAdministrativeDancer,
} from "@/lib/admin/dancers/dancers.server";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { getFieldErrors } from "@/lib/shared/form-validation";
import {
  createValidatedNativeSubmitHandler,
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";
import type { RouteNotificationKey } from "@/lib/shared/route-notification-toasts";

import type { Route } from "./+types/administracion_.bailarines_.$dancerId";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Awaited<ReturnType<typeof action>>;
type DancerActionError = {
  status: "error";
  message: string;
  fieldErrors: AdministrativeDancerFieldErrors;
  values: AdministrativeDancerUpdateInput | AdministrativeDancerStatusInput;
};
type DancerFormReturn = UseFormReturn<
  AdministrativeDancerUpdateInput,
  unknown,
  AdministrativeDancerUpdateInput
>;
type DancerStatusFormReturn = UseFormReturn<
  AdministrativeDancerStatusInput,
  unknown,
  AdministrativeDancerStatusInput
>;
type DancerRouteNotification = Extract<
  RouteNotificationKey,
  "bailarin-archivado" | "bailarin-guardado" | "bailarin-reactivado"
>;

type AdministracionBailarinDetalleRouteProps = {
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
const noDocumentTypeSelectValue = "sin-documento";
const dancerFieldNames = [
  "firstName",
  "lastName",
  "birthDate",
  "documentType",
  "documentNumber",
  "correctionReason",
] as const satisfies ReadonlyArray<keyof AdministrativeDancerFieldErrors>;
const emptyDancerFieldErrors: AdministrativeDancerFieldErrors = {};

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

  const values = readDancerUpdateValues(formData);
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
    buildDetailNotificationHref(request.url, dancerId, "bailarin-guardado"),
  );
}

export function AdministracionBailarinDetalleRouteView({
  loaderData,
  actionData: actionDataOverride,
}: AdministracionBailarinDetalleRouteProps) {
  const actionData =
    actionDataOverride?.status === "error" ? actionDataOverride : undefined;

  useServerActionToast(actionData, {
    toastId: "admin-dancer-detail:error",
  });

  const dancer = loaderData.dancer;
  const isEditing =
    loaderData.canEdit && (loaderData.isEditing || Boolean(actionData));
  const submittedEditValues = isDancerUpdateValues(actionData?.values)
    ? actionData.values
    : null;
  const editFieldErrors = submittedEditValues
    ? actionData?.fieldErrors
    : emptyDancerFieldErrors;
  const statusFieldErrors =
    !submittedEditValues && actionData?.fieldErrors
      ? actionData.fieldErrors
      : emptyDancerFieldErrors;
  const editValues = {
    firstName: submittedEditValues?.firstName ?? dancer.firstName,
    lastName: submittedEditValues?.lastName ?? dancer.lastName,
    birthDate: submittedEditValues?.birthDate ?? dancer.birthDate,
    documentType:
      submittedEditValues?.documentType ?? dancer.documentType ?? "",
    documentNumber:
      submittedEditValues?.documentNumber ?? dancer.documentNumber ?? "",
    correctionReason: submittedEditValues?.correctionReason ?? "",
  };
  const statusValues = {
    correctionReason:
      !submittedEditValues && actionData?.values.correctionReason
        ? actionData.values.correctionReason
        : "",
  };
  const editForm = useDancerEditForm({
    correctionReasonRequired: dancer.correctionReasonRequired,
    fieldErrors: editFieldErrors,
    values: editValues,
  });
  const statusForm = useDancerStatusForm({
    correctionReasonRequired: dancer.correctionReasonRequired,
    fieldErrors: statusFieldErrors,
    values: statusValues,
  });
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
          <Button asChild variant="outline">
            <Link to={loaderData.backToList}>
              <ArrowLeft data-icon="inline-start" />
              Volver a Bailarines
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
                <input type="hidden" name="intent" value="update-dancer" />
                <FieldGroup>
                  <DancerTextField
                    form={editForm.form}
                    label="Nombre"
                    name="firstName"
                  />
                  <DancerTextField
                    form={editForm.form}
                    label="Apellido"
                    name="lastName"
                  />
                  <DancerBirthDateField form={editForm.form} />
                  <DancerDocumentTypeField form={editForm.form} />
                  <DancerTextField
                    form={editForm.form}
                    label="Número de documento"
                    name="documentNumber"
                  />
                  <DancerCorrectionReasonField
                    form={editForm.form}
                    required={dancer.correctionReasonRequired}
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
          <DetailRow label="Evento activo">
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
            <form
              method="post"
              noValidate
              className="mt-4"
              onSubmit={statusForm.handleSubmit}
            >
              <input type="hidden" name="intent" value={statusAction.intent} />
              <FieldGroup>
                <DancerCorrectionReasonField
                  form={statusForm.form}
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
              </FieldGroup>
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

  return (
    <AdministracionBailarinDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

function useDancerEditForm({
  correctionReasonRequired,
  fieldErrors = emptyDancerFieldErrors,
  values,
}: {
  correctionReasonRequired: boolean;
  fieldErrors?: AdministrativeDancerFieldErrors;
  values: AdministrativeDancerUpdateInput;
}) {
  const form = useForm<
    AdministrativeDancerUpdateInput,
    unknown,
    AdministrativeDancerUpdateInput
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(buildDancerUpdateSchema(correctionReasonRequired)),
  });

  useEffect(() => {
    form.reset(values);
  }, [
    form,
    values.birthDate,
    values.correctionReason,
    values.documentNumber,
    values.documentType,
    values.firstName,
    values.lastName,
  ]);

  useApplyServerFieldErrors(form, fieldErrors);

  return { form, handleSubmit: createValidatedNativeSubmitHandler(form) };
}

function useDancerStatusForm({
  correctionReasonRequired,
  fieldErrors = emptyDancerFieldErrors,
  values,
}: {
  correctionReasonRequired: boolean;
  fieldErrors?: AdministrativeDancerFieldErrors;
  values: AdministrativeDancerStatusInput;
}) {
  const form = useForm<
    AdministrativeDancerStatusInput,
    unknown,
    AdministrativeDancerStatusInput
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(buildDancerStatusSchema(correctionReasonRequired)),
  });

  useEffect(() => {
    form.reset(values);
  }, [form, values.correctionReason]);

  useApplyServerFieldErrors(form, fieldErrors);

  return { form, handleSubmit: createValidatedNativeSubmitHandler(form) };
}

function DancerTextField({
  form,
  label,
  name,
}: {
  form: DancerFormReturn;
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

function DancerBirthDateField({ form }: { form: DancerFormReturn }) {
  const id = useId();

  return (
    <Controller
      control={form.control}
      name="birthDate"
      render={({ field, fieldState }) => (
        <DateOnlyField
          id={id}
          label="Fecha de nacimiento"
          name={field.name}
          defaultValue={field.value}
          error={fieldState.error?.message}
          onBlur={field.onBlur}
          onValueChange={field.onChange}
          value={field.value}
        />
      )}
    />
  );
}

function DancerDocumentTypeField({ form }: { form: DancerFormReturn }) {
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
              value={field.value || noDocumentTypeSelectValue}
              onValueChange={(value) => {
                field.onChange(
                  value === noDocumentTypeSelectValue ? "" : value,
                );
              }}
            >
              <input type="hidden" name={field.name} value={field.value} />
              <SelectTrigger
                id={id}
                aria-invalid={fieldState.error ? true : undefined}
                aria-describedby={fieldState.error ? errorId : undefined}
                className="h-10 w-full"
              >
                <SelectValue placeholder="Sin documento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={noDocumentTypeSelectValue}>
                  Sin documento
                </SelectItem>
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

function DancerCorrectionReasonField<
  TFieldValues extends AdministrativeDancerStatusInput,
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
                ? "Obligatorio entre 10 y 500 caracteres para este Bailarín."
                : "Opcional. Si lo completás, usá entre 10 y 500 caracteres."}
            </FieldDescription>
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function buildDancerUpdateSchema(correctionReasonRequired: boolean) {
  return z
    .object({
      firstName: z.string().trim().min(1, requiredFieldMessage),
      lastName: z.string().trim().min(1, requiredFieldMessage),
      birthDate: z
        .string()
        .trim()
        .min(1, requiredFieldMessage)
        .superRefine((value, context) => {
          if (value.length === 0) {
            return;
          }

          if (!isDateOnly(value)) {
            context.addIssue({
              code: "custom",
              message: "Usá una fecha válida.",
            });
            return;
          }

          if (isFutureDateOnly(value)) {
            context.addIssue({
              code: "custom",
              message: "La fecha de nacimiento no puede ser futura.",
            });
          }
        }),
      documentType: z.string().trim(),
      documentNumber: z.string().trim(),
      correctionReason: buildCorrectionReasonSchema(correctionReasonRequired),
    })
    .superRefine((values, context) => {
      validateDocumentPair(values.documentType, values.documentNumber, context);
    });
}

function buildDancerStatusSchema(correctionReasonRequired: boolean) {
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
            message: adminDancerCorrectionReasonMessage,
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
          message: adminDancerCorrectionReasonMessage,
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
      message: "Ingresá un DNI válido usando solo números.",
      path: ["documentNumber"],
    });
  }
}

function isDocumentType(value: string): value is "dni" | "other" | "passport" {
  return value === "dni" || value === "passport" || value === "other";
}

function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return parsed.toISOString().slice(0, 10) === value;
}

function isFutureDateOnly(value: string) {
  const today = new Date().toISOString().slice(0, 10);

  return value > today;
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

function buildBackToListHref(requestUrl: string) {
  const url = new URL(requestUrl);
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("modo");
  searchParams.delete("evento");
  searchParams.delete("notificacion");
  const search = searchParams.toString();

  return `/administracion/bailarines${search.length > 0 ? `?${search}` : ""}`;
}

function buildModeHref(url: URL, dancerId: string, mode: "editar" | null) {
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("evento");
  searchParams.delete("notificacion");

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

function buildDetailNotificationHref(
  requestUrl: string,
  dancerId: string,
  notification: DancerRouteNotification,
) {
  const url = new URL(requestUrl);
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("modo");
  searchParams.delete("evento");
  searchParams.delete("notificacion");
  searchParams.set("notificacion", notification);

  return `/administracion/bailarines/${dancerId}?${searchParams.toString()}`;
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
