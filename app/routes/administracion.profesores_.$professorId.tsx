import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Ellipsis, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import { Link, redirect, useActionData } from "react-router";
import { z } from "zod";

import {
  AdminResourceLayout,
  type AdminResourceBreadcrumbItem,
} from "@/components/admin/resource-layout";
import type { AdminRouteHandle } from "@/components/admin/shell";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  getAdminProfessorParticipationLabel,
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
  createValidatedNativeSubmitHandler,
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import type { RouteNotificationKey } from "@/lib/shared/route-notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/administracion.profesores_.$professorId";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Awaited<ReturnType<typeof action>>;
type ProfessorEditFormValues = Omit<
  AdministrativeProfessorUpdateInput,
  "correctionReason"
>;
type ProfessorReasonFormValues = {
  correctionReason: string;
  statusIntent: "" | "archive-professor" | "reactivate-professor";
};
type ProfessorActionError = {
  status: "error";
  message: string;
  fieldErrors: AdministrativeProfessorFieldErrors;
  values: AdministrativeProfessorUpdateInput | ProfessorReasonFormValues;
};
type ProfessorEditFormReturn = UseFormReturn<
  ProfessorEditFormValues,
  unknown,
  ProfessorEditFormValues
>;
type ProfessorReasonFormReturn = UseFormReturn<
  ProfessorReasonFormValues,
  unknown,
  ProfessorReasonFormValues
>;
type ProfessorRouteNotification = Extract<
  RouteNotificationKey,
  "profesor-archivado" | "profesor-guardado" | "profesor-reactivado"
>;
type ProfessorDialogIntent =
  | "archive-professor"
  | "reactivate-professor"
  | "update-professor";
type ProfessorConfirmationAction = {
  confirmLabel: string;
  confirmTitle: string;
  description: string;
  intent: ProfessorDialogIntent;
  variant: "default" | "destructive";
};

type AdministracionProfesorDetalleRouteProps = {
  loaderData: LoaderData;
  actionData?: ActionData;
};

const correctionReasonMaxLength = 500;
const correctionReasonMinLength = 10;
const noDocumentTypeSelectValue = "sin-documento";
const professorFieldNames = [
  "firstName",
  "lastName",
  "documentType",
  "documentNumber",
  "correctionReason",
] as const satisfies ReadonlyArray<keyof AdministrativeProfessorFieldErrors>;
const emptyProfessorFieldErrors: AdministrativeProfessorFieldErrors = {};

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
        ? { label: `${professor.lastName}, ${professor.firstName}` }
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

  useServerActionToast(actionData, {
    toastId: "admin-professor-detail:error",
  });

  const professor = loaderData.professor;
  const isEditing =
    loaderData.canEdit && (loaderData.isEditing || Boolean(actionData));
  const submittedUpdateValues = isProfessorUpdateValues(actionData?.values)
    ? actionData.values
    : null;
  const editValues: ProfessorEditFormValues = {
    firstName: submittedUpdateValues?.firstName ?? professor.firstName,
    lastName: submittedUpdateValues?.lastName ?? professor.lastName,
    documentType:
      submittedUpdateValues?.documentType ?? professor.documentType ?? "",
    documentNumber:
      submittedUpdateValues?.documentNumber ?? professor.documentNumber ?? "",
  };
  const reasonValues = {
    correctionReason: actionData?.values.correctionReason ?? "",
    statusIntent: isProfessorStatusValues(actionData?.values)
      ? actionData.values.statusIntent
      : "",
  };
  const editForm = useProfessorEditForm({
    fieldErrors: getProfessorEditFieldErrors(actionData?.fieldErrors),
    values: editValues,
  });
  const reasonForm = useProfessorReasonForm({
    correctionReasonRequired: professor.correctionReasonRequired,
    fieldErrors: getProfessorReasonFieldErrors(actionData?.fieldErrors),
    values: reasonValues,
  });
  const [dialogIntent, setDialogIntent] =
    useState<ProfessorDialogIntent | null>(
      getInitialDialogIntent(actionData, professor.correctionReasonRequired),
    );
  const [pendingUpdateValues, setPendingUpdateValues] =
    useState<ProfessorEditFormValues | null>(
      submittedUpdateValues
        ? toProfessorEditValues(submittedUpdateValues)
        : null,
    );

  useEffect(() => {
    const nextIntent = getInitialDialogIntent(
      actionData,
      professor.correctionReasonRequired,
    );
    if (!nextIntent) {
      return;
    }

    setDialogIntent(nextIntent);

    if (submittedUpdateValues) {
      setPendingUpdateValues(toProfessorEditValues(submittedUpdateValues));
    }
  }, [actionData, professor.correctionReasonRequired, submittedUpdateValues]);

  const confirmationAction = getProfessorConfirmationAction({
    active: professor.active,
    intent: dialogIntent,
  });
  const breadcrumbItems: AdminResourceBreadcrumbItem[] = [
    { label: "Profesores", to: loaderData.backToList },
    { label: `${professor.lastName}, ${professor.firstName}` },
  ];

  function handleEditSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const submitNative = () => {
      event.currentTarget.submit();
    };
    const openDialog = (values: ProfessorEditFormValues) => {
      setPendingUpdateValues(values);
      setDialogIntent("update-professor");
    };

    if (!professor.correctionReasonRequired) {
      void editForm.form.handleSubmit(submitNative)(event);
      return;
    }

    void editForm.form.handleSubmit(openDialog)(event);
  }

  return (
    <AdminResourceLayout
      loaderData={{
        email: loaderData.email,
        events: loaderData.eventOptions,
        selectedEventId: loaderData.selectedEventId,
      }}
      breadcrumbItems={breadcrumbItems}
      requireSelectedEvent={false}
      title="Detalle profesor"
      description="Revisá la información administrativa de este profesor."
      headerAction={
        loaderData.canEdit ? (
          <ProfessorActionsMenu
            active={professor.active}
            onSelect={(intent) => {
              reasonForm.form.reset({
                correctionReason: actionData?.values.correctionReason ?? "",
              });
              setDialogIntent(intent);
              reasonForm.form.setValue("statusIntent", intent);
            }}
          />
        ) : null
      }
    >
      <section className="flex flex-col gap-6">
        <Card>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              {!professor.active ? (
                <Alert>
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>
                    Este profesor está archivado. Reactivalo para que vuelva a
                    aparecer en las vistas activas y en próximas selecciones del
                    portal.
                  </AlertDescription>
                  {loaderData.canEdit ? (
                    <AlertAction>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={() => {
                          reasonForm.form.reset({
                            correctionReason:
                              actionData?.values.correctionReason ?? "",
                            statusIntent: "reactivate-professor",
                          });
                          setDialogIntent("reactivate-professor");
                        }}
                      >
                        Reactivar
                      </Button>
                    </AlertAction>
                  ) : null}
                </Alert>
              ) : null}
              {professor.isIncomplete ? (
                <Alert>
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>
                    Faltan datos de identificación.
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Badge variant={professor.active ? "default" : "secondary"}>
                  {professor.active ? "Activo" : "Archivado"}
                </Badge>
                <ParticipationBadge
                  participationStatus={professor.participationStatus}
                />
                {professor.isIncomplete ? (
                  <Badge variant="secondary">Identificación incompleta</Badge>
                ) : (
                  <Badge variant="outline">Identificación completa</Badge>
                )}
              </div>
            </div>

            <form
              id="administracion-profesor-form"
              method="post"
              noValidate
              onSubmit={handleEditSubmit}
            >
              <input type="hidden" name="intent" value="update-professor" />
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <ReadOnlyField
                  label="Academia"
                  value={professor.academy.name}
                />
                <ProfessorTextField
                  disabled={!isEditing}
                  form={editForm.form}
                  label="Nombre"
                  name="firstName"
                />
                <ProfessorTextField
                  disabled={!isEditing}
                  form={editForm.form}
                  label="Apellido"
                  name="lastName"
                />
                <ProfessorDocumentTypeField
                  disabled={!isEditing}
                  form={editForm.form}
                />
                <ProfessorTextField
                  disabled={!isEditing}
                  form={editForm.form}
                  label="Número de documento"
                  name="documentNumber"
                />
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          {isEditing ? (
            <Button asChild variant="outline" size="lg">
              <Link to={loaderData.cancelHref}>Cancelar</Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="lg">
              <Link to={loaderData.backToList}>
                <ArrowLeft aria-hidden="true" data-icon="inline-start" />
                Volver
              </Link>
            </Button>
          )}
          {loaderData.canEdit ? (
            isEditing ? (
              <Button
                type="submit"
                form="administracion-profesor-form"
                size="lg"
              >
                Guardar
              </Button>
            ) : (
              <Button asChild size="lg">
                <Link to={loaderData.editHref}>Editar</Link>
              </Button>
            )
          ) : null}
        </div>
      </section>

      <ProfessorConfirmationDialog
        action={confirmationAction}
        correctionReasonRequired={
          dialogIntent === "update-professor" ||
          professor.correctionReasonRequired
        }
        intent={dialogIntent}
        onOpenChange={(open) => {
          if (!open) {
            setDialogIntent(null);
          }
        }}
        pendingUpdateValues={pendingUpdateValues}
        reasonForm={reasonForm}
      />
    </AdminResourceLayout>
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
  fieldErrors = emptyProfessorFieldErrors,
  values,
}: {
  fieldErrors?: AdministrativeProfessorFieldErrors;
  values: ProfessorEditFormValues;
}) {
  const form = useForm<
    ProfessorEditFormValues,
    unknown,
    ProfessorEditFormValues
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(buildProfessorEditSchema()),
  });

  useEffect(() => {
    form.reset(values);
  }, [
    form,
    values.documentNumber,
    values.documentType,
    values.firstName,
    values.lastName,
  ]);

  useApplyServerFieldErrors(form, fieldErrors);

  return { form };
}

function useProfessorReasonForm({
  correctionReasonRequired,
  fieldErrors = emptyProfessorFieldErrors,
  values,
}: {
  correctionReasonRequired: boolean;
  fieldErrors?: AdministrativeProfessorFieldErrors;
  values: ProfessorReasonFormValues;
}) {
  const form = useForm<
    ProfessorReasonFormValues,
    unknown,
    ProfessorReasonFormValues
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(buildProfessorReasonSchema(correctionReasonRequired)),
  });

  useEffect(() => {
    form.reset(values);
  }, [form, values.correctionReason, values.statusIntent]);

  useApplyServerFieldErrors(form, fieldErrors);

  return { form, handleSubmit: createValidatedNativeSubmitHandler(form) };
}

function ProfessorActionsMenu({
  active,
  onSelect,
}: {
  active: boolean;
  onSelect: (intent: "archive-professor" | "reactivate-professor") => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="lg">
          <Ellipsis aria-hidden="true" data-icon />
          Acciones
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          variant={active ? "destructive" : "default"}
          onSelect={(event) => {
            event.preventDefault();
            onSelect(active ? "archive-professor" : "reactivate-professor");
          }}
        >
          {active ? "Archivar" : "Reactivar"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProfessorTextField({
  disabled,
  form,
  label,
  name,
}: {
  disabled: boolean;
  form: ProfessorEditFormReturn;
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
              disabled={disabled}
              readOnly={disabled}
              {...field}
            />
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function ProfessorDocumentTypeField({
  disabled,
  form,
}: {
  disabled: boolean;
  form: ProfessorEditFormReturn;
}) {
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
              disabled={disabled}
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

function ProfessorCorrectionReasonField({
  form,
  required,
}: {
  form: ProfessorReasonFormReturn;
  required: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <Controller
      control={form.control}
      name="correctionReason"
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
                ? "Obligatorio entre 10 y 500 caracteres para este profesor."
                : "Opcional. Si lo completás, usá entre 10 y 500 caracteres."}
            </FieldDescription>
            <input
              type="hidden"
              name="statusIntent"
              value={form.getValues("statusIntent") ?? ""}
            />
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function ProfessorConfirmationDialog({
  action,
  correctionReasonRequired,
  intent,
  onOpenChange,
  pendingUpdateValues,
  reasonForm,
}: {
  action: ProfessorConfirmationAction;
  correctionReasonRequired: boolean;
  intent: ProfessorDialogIntent | null;
  onOpenChange: (open: boolean) => void;
  pendingUpdateValues: ProfessorEditFormValues | null;
  reasonForm: {
    form: ProfessorReasonFormReturn;
    handleSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void;
  };
}) {
  const isOpen = intent !== null;
  const formId = getProfessorDialogFormId(intent);
  const isUpdateIntent = intent === "update-professor";
  const canSubmitUpdate = !isUpdateIntent || pendingUpdateValues !== null;
  const pendingUpdateFields = isUpdateIntent ? pendingUpdateValues : null;

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      {intent ? (
        <AlertDialogContent forceMount size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{action.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {action.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            id={formId}
            method="post"
            noValidate
            onSubmit={
              correctionReasonRequired ? reasonForm.handleSubmit : undefined
            }
            className="grid gap-4"
          >
            <input type="hidden" name="intent" value={action.intent} />
            {pendingUpdateFields ? (
              <>
                <input
                  type="hidden"
                  name="firstName"
                  value={pendingUpdateFields.firstName}
                />
                <input
                  type="hidden"
                  name="lastName"
                  value={pendingUpdateFields.lastName}
                />
                <input
                  type="hidden"
                  name="documentType"
                  value={pendingUpdateFields.documentType}
                />
                <input
                  type="hidden"
                  name="documentNumber"
                  value={pendingUpdateFields.documentNumber}
                />
              </>
            ) : null}
            {correctionReasonRequired ? (
              <ProfessorCorrectionReasonField
                form={reasonForm.form}
                required={correctionReasonRequired}
              />
            ) : null}
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction asChild variant={action.variant}>
              <Button form={formId} type="submit" disabled={!canSubmitUpdate}>
                {action.confirmLabel}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  const id = useId();

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        <Input id={id} value={value} disabled readOnly />
      </FieldContent>
    </Field>
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

function getProfessorConfirmationAction({
  active,
  intent,
}: {
  active: boolean;
  intent: ProfessorDialogIntent | null;
}): ProfessorConfirmationAction {
  if (intent === "update-professor") {
    return {
      confirmLabel: "Guardar",
      confirmTitle: "Confirmar guardado",
      description:
        "Este profesor tiene participación actual o histórica. Ingresá el motivo de corrección para guardar los cambios.",
      intent: "update-professor",
      variant: "default",
    };
  }

  if (active) {
    return {
      confirmLabel: "Archivar",
      confirmTitle: "¿Archivar profesor?",
      description:
        "El profesor dejará de aparecer en las vistas activas y en próximas selecciones del portal. Sus participaciones históricas se mantienen.",
      intent: "archive-professor",
      variant: "destructive",
    };
  }

  return {
    confirmLabel: "Reactivar",
    confirmTitle: "¿Reactivar profesor?",
    description:
      "El profesor volverá a aparecer en las vistas activas y en próximas selecciones del portal.",
    intent: "reactivate-professor",
    variant: "default",
  };
}

function buildProfessorEditSchema() {
  return z
    .object({
      firstName: z.string().trim().min(1, requiredFieldMessage),
      lastName: z.string().trim().min(1, requiredFieldMessage),
      documentType: z.string().trim(),
      documentNumber: z.string().trim(),
    })
    .superRefine((values, context) => {
      validateDocumentPair(values.documentType, values.documentNumber, context);
    });
}

function buildProfessorUpdateSchema(correctionReasonRequired: boolean) {
  return buildProfessorEditSchema().extend({
    correctionReason: buildCorrectionReasonSchema(correctionReasonRequired),
  });
}

function buildProfessorReasonSchema(correctionReasonRequired: boolean) {
  return z.object({
    correctionReason: buildCorrectionReasonSchema(correctionReasonRequired),
    statusIntent: z.union([
      z.literal(""),
      z.literal("archive-professor"),
      z.literal("reactivate-professor"),
    ]),
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

function readProfessorReasonValues(
  formData: FormData,
): ProfessorReasonFormValues {
  return {
    correctionReason: readFormString(formData, "correctionReason"),
    statusIntent: readProfessorStatusIntent(formData),
  };
}

function readProfessorUpdateValues(
  formData: FormData,
): AdministrativeProfessorUpdateInput {
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
): values is AdministrativeProfessorUpdateInput {
  return (
    values !== undefined &&
    "firstName" in values &&
    "lastName" in values &&
    "documentType" in values &&
    "documentNumber" in values
  );
}

function isProfessorStatusValues(
  values: ProfessorActionError["values"] | undefined,
): values is ProfessorReasonFormValues {
  return values !== undefined && "statusIntent" in values;
}

function getProfessorEditFieldErrors(
  fieldErrors: AdministrativeProfessorFieldErrors | undefined,
): AdministrativeProfessorFieldErrors {
  if (!fieldErrors) {
    return emptyProfessorFieldErrors;
  }

  const { correctionReason: _correctionReason, ...editFieldErrors } =
    fieldErrors;
  return editFieldErrors;
}

function getProfessorReasonFieldErrors(
  fieldErrors: AdministrativeProfessorFieldErrors | undefined,
): AdministrativeProfessorFieldErrors {
  if (!fieldErrors?.correctionReason) {
    return emptyProfessorFieldErrors;
  }

  return {
    correctionReason: fieldErrors.correctionReason,
  };
}

function getInitialDialogIntent(
  actionData: ProfessorActionError | undefined,
  correctionReasonRequired: boolean,
): ProfessorDialogIntent | null {
  if (!actionData || !actionData.fieldErrors.correctionReason) {
    return null;
  }

  if (isProfessorUpdateValues(actionData.values) && correctionReasonRequired) {
    return "update-professor";
  }

  if (isProfessorStatusValues(actionData.values)) {
    return actionData.values.statusIntent || "archive-professor";
  }

  return null;
}

function toProfessorEditValues(
  values: AdministrativeProfessorUpdateInput,
): ProfessorEditFormValues {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    documentType: values.documentType,
    documentNumber: values.documentNumber,
  };
}

function getProfessorDialogFormId(intent: ProfessorDialogIntent | null) {
  switch (intent) {
    case "archive-professor":
      return "administracion-profesor-archive-form";
    case "reactivate-professor":
      return "administracion-profesor-reactivate-form";
    case "update-professor":
      return "administracion-profesor-save-form";
    case null:
      return "administracion-profesor-dialog-form";
  }
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readProfessorStatusIntent(
  formData: FormData,
): ProfessorReasonFormValues["statusIntent"] {
  const value = readFormString(formData, "statusIntent");

  if (value === "archive-professor" || value === "reactivate-professor") {
    return value;
  }

  return "";
}
