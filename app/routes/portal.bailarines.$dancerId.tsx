import { zodResolver } from "@hookform/resolvers/zod";
import { Ellipsis, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import { Link, redirect, useActionData } from "react-router";
import { z } from "zod";

import { PortalShell } from "@/components/portal/ui";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
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
import { getDancerVerificationStatus } from "@/lib/dancers/verification";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { getPortalEventContext } from "@/lib/portal/event-context.server";
import {
  archiveDancerForAcademy,
  findDancerForAcademy,
  reactivateDancerForAcademy,
  updateDancerForAcademy,
  type UpdateDancerField,
} from "@/lib/portal/dancers.server";
import {
  createValidatedNativeSubmitHandler,
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

const dancerNotFoundMessage = "No encontramos ese Bailarín.";
const formId = "portal-bailarin-form";
const noDocumentTypeSelectValue = "sin-documento";

const dancerSchema = z
  .object({
    firstName: z.string().trim().min(1, requiredFieldMessage),
    lastName: z.string().trim().min(1, requiredFieldMessage),
    birthDate: z.string().trim().min(1, requiredFieldMessage),
    documentType: z.string().trim(),
    documentNumber: z.string().trim(),
    documentFrontImageStorageKey: z.string().trim(),
    documentBackImageStorageKey: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (!values.documentType && !values.documentNumber) {
      return;
    }

    if (!values.documentType) {
      context.addIssue({
        code: "custom",
        message: "Seleccioná el tipo de documento.",
        path: ["documentType"],
      });
    }

    if (!values.documentNumber) {
      context.addIssue({
        code: "custom",
        message: "Ingresá el número de documento.",
        path: ["documentNumber"],
      });
    }
  });

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Extract<
  Awaited<ReturnType<typeof action>>,
  { status: "error" }
>;
type DancerFormValues = z.infer<typeof dancerSchema>;
type DancerFormReturn = UseFormReturn<
  DancerFormValues,
  unknown,
  DancerFormValues
>;
type DancerFieldErrors = NonNullable<ActionData["fieldErrors"]>;
type DancerStatusIntent = "archive-dancer" | "reactivate-dancer";
type DancerStatusAction = {
  intent: DancerStatusIntent;
  label: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmButtonLabel: string;
  confirmButtonVariant: "default" | "destructive";
};

const emptyDancerFieldErrors: DancerFieldErrors = {};

const dancerStatusActions = {
  "archive-dancer": {
    intent: "archive-dancer",
    label: "Archivar",
    confirmTitle: "¿Archivar bailarín?",
    confirmDescription:
      "El bailarín dejará de aparecer en listas activas y en próximas selecciones de coreografías. Sus coreografías existentes no se modifican.",
    confirmButtonLabel: "Archivar",
    confirmButtonVariant: "destructive",
  },
  "reactivate-dancer": {
    intent: "reactivate-dancer",
    label: "Reactivar",
    confirmTitle: "¿Reactivar bailarín?",
    confirmDescription:
      "El bailarín volverá a aparecer en listas activas y en próximas selecciones de coreografías. Sus coreografías existentes no se modifican.",
    confirmButtonLabel: "Reactivar",
    confirmButtonVariant: "default",
  },
} as const satisfies Record<DancerStatusIntent, DancerStatusAction>;

type PortalBailarinDetalleRouteProps = {
  loaderData: LoaderData;
  actionData?: ActionData;
  initialStatusDialogIntent?: DancerStatusIntent | null;
};
type DancerTextFieldName =
  | "documentBackImageStorageKey"
  | "documentFrontImageStorageKey"
  | "documentNumber"
  | "firstName"
  | "lastName";

export const meta = () => [
  { title: "Editar bailarín | Portal de academias | En Escena" },
];

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { dancerId?: string };
}) {
  const { academy, user } = await requireAcademyUser(request);
  const dancerId = readDancerId(params);
  const [eventContext, dancer] = await Promise.all([
    getPortalEventContext(request),
    requireDancer(academy.id, dancerId),
  ]);

  return {
    email: user.email,
    userName: user.name ?? "",
    academy,
    eventContext,
    dancer,
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
  const dancerId = readDancerId(params);

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

  const result = await updateDancerForAcademy(academy.id, dancerId, {
    firstName: readFormString(formData, "firstName"),
    lastName: readFormString(formData, "lastName"),
    birthDate: readFormString(formData, "birthDate"),
    documentType: readFormString(formData, "documentType"),
    documentNumber: readFormString(formData, "documentNumber"),
    documentFrontImageStorageKey: readFormString(
      formData,
      "documentFrontImageStorageKey",
    ),
    documentBackImageStorageKey: readFormString(
      formData,
      "documentBackImageStorageKey",
    ),
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
  const formValues = actionData?.values ?? {
    firstName: loaderData.dancer.firstName,
    lastName: loaderData.dancer.lastName,
    birthDate: loaderData.dancer.birthDate,
    documentType: loaderData.dancer.documentType ?? "",
    documentNumber: loaderData.dancer.documentNumber ?? "",
    documentFrontImageStorageKey:
      loaderData.dancer.documentFrontImageStorageKey ?? "",
    documentBackImageStorageKey:
      loaderData.dancer.documentBackImageStorageKey ?? "",
  };
  const form = useDancerForm({
    fieldErrors: actionData?.fieldErrors,
    values: formValues,
  });
  const [statusDialogIntent, setStatusDialogIntent] =
    useState<DancerStatusIntent | null>(initialStatusDialogIntent);
  const statusAction = getDancerStatusAction(loaderData.dancer.active);
  const verificationStatus = getDancerVerificationStatus(loaderData.dancer);
  const showsIdentificationAlert = verificationStatus === "incomplete";
  const showsMissingImagesAlert = verificationStatus === "missingImages";
  const isIdentityLocked = verificationStatus === "verified";

  useServerActionToast(getGeneralActionError(actionData), {
    toastId: "portal-bailarin-detail:error",
  });

  return (
    <PortalShell
      userEmail={loaderData.email}
      userName={loaderData.userName}
      academyName={loaderData.academy.name}
      eventContext={loaderData.eventContext}
      title="Bailarines"
      breadcrumbItems={[
        { label: "Bailarines", to: "/portal/bailarines" },
        {
          label: `${loaderData.dancer.lastName}, ${loaderData.dancer.firstName}`,
        },
      ]}
    >
      <section
        className="flex flex-col gap-6"
        aria-labelledby="bailarin-detail-title"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 id="bailarin-detail-title" className="text-xl font-semibold">
              Editar bailarín
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Actualizá los datos de este bailarín.
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="lg">
                <Ellipsis aria-hidden="true" data-icon />
                Acciones
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                variant={statusAction.confirmButtonVariant}
                onSelect={(event) => {
                  event.preventDefault();
                  setStatusDialogIntent(statusAction.intent);
                }}
              >
                {statusAction.label}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              {!loaderData.dancer.active ? (
                <Alert>
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>
                    Este bailarín está archivado. Reactivalo para que vuelva a
                    aparecer en las listas activas y en próximas selecciones de
                    coreografías.
                  </AlertDescription>
                  <AlertAction>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => {
                        setStatusDialogIntent("reactivate-dancer");
                      }}
                    >
                      Reactivar
                    </Button>
                  </AlertAction>
                </Alert>
              ) : null}
              {showsIdentificationAlert ? (
                <Alert>
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>
                    Faltan datos de identificación para completar la
                    verificación.
                  </AlertDescription>
                </Alert>
              ) : null}
              {showsMissingImagesAlert ? (
                <Alert>
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>
                    Faltan imágenes del documento para completar la
                    verificación.
                  </AlertDescription>
                </Alert>
              ) : null}
              {verificationStatus === "unverified" ? (
                <Alert>
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>
                    La documentación está lista para revisión administrativa.
                  </AlertDescription>
                </Alert>
              ) : null}
              {verificationStatus === "verified" ? (
                <Alert>
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>
                    La identidad ya fue verificada por administración. Solo
                    administración puede corregir estos datos.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>

            <form
              id={formId}
              method="post"
              noValidate
              onSubmit={form.handleSubmit}
            >
              <input type="hidden" name="intent" value="update-dancer" />
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <DancerTextField
                  form={form.form}
                  error={actionData?.fieldErrors.firstName}
                  disabled={isIdentityLocked}
                  label="Nombre"
                  name="firstName"
                />
                <DancerTextField
                  form={form.form}
                  error={actionData?.fieldErrors.lastName}
                  disabled={isIdentityLocked}
                  label="Apellido"
                  name="lastName"
                />
                <DancerBirthDateField
                  form={form.form}
                  error={actionData?.fieldErrors.birthDate}
                />
                <div className="hidden md:block" aria-hidden="true" />
                <DancerDocumentTypeField
                  form={form.form}
                  error={actionData?.fieldErrors.documentType}
                  disabled={isIdentityLocked}
                />
                <DancerTextField
                  form={form.form}
                  error={actionData?.fieldErrors.documentNumber}
                  disabled={isIdentityLocked}
                  label="Número de documento"
                  name="documentNumber"
                />
                <DancerTextField
                  form={form.form}
                  error={actionData?.fieldErrors.documentFrontImageStorageKey}
                  disabled={isIdentityLocked}
                  label="Imagen frente del documento"
                  name="documentFrontImageStorageKey"
                />
                <DancerTextField
                  form={form.form}
                  error={actionData?.fieldErrors.documentBackImageStorageKey}
                  disabled={isIdentityLocked}
                  label="Imagen dorso del documento"
                  name="documentBackImageStorageKey"
                />
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button asChild variant="outline" size="lg">
            <Link to="/portal/bailarines">Volver</Link>
          </Button>
          <Button
            type="submit"
            form={formId}
            size="lg"
            disabled={isIdentityLocked}
          >
            Guardar
          </Button>
        </div>
      </section>

      <DancerStatusDialog
        intent={statusDialogIntent}
        onOpenChange={(open) => {
          if (!open) {
            setStatusDialogIntent(null);
          }
        }}
      />
    </PortalShell>
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

function useDancerForm({
  fieldErrors = emptyDancerFieldErrors,
  values,
}: {
  fieldErrors?: DancerFieldErrors;
  values: DancerFormValues;
}) {
  const form = useForm<DancerFormValues, unknown, DancerFormValues>({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(dancerSchema),
  });

  useEffect(() => {
    form.reset(values);
  }, [
    form,
    values.birthDate,
    values.documentBackImageStorageKey,
    values.documentFrontImageStorageKey,
    values.documentNumber,
    values.documentType,
    values.firstName,
    values.lastName,
  ]);

  useApplyServerFieldErrors(form, fieldErrors);

  return { form, handleSubmit: createValidatedNativeSubmitHandler(form) };
}

function DancerTextField({
  disabled = false,
  error,
  form,
  label,
  name,
}: {
  disabled?: boolean;
  error?: string;
  form: DancerFormReturn;
  label: string;
  name: DancerTextFieldName;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const autoComplete = getDancerFieldAutoComplete(name);

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error || error ? true : undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldContent>
            <Input
              id={id}
              autoComplete={autoComplete}
              disabled={disabled}
              aria-invalid={fieldState.error || error ? true : undefined}
              aria-describedby={fieldState.error || error ? errorId : undefined}
              {...field}
            />
            <FieldError id={errorId}>
              {fieldState.error?.message ?? error}
            </FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function DancerBirthDateField({
  error,
  form,
}: {
  error?: string;
  form: DancerFormReturn;
}) {
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
          defaultValue={field.value ?? ""}
          value={field.value ?? ""}
          onBlur={field.onBlur}
          onValueChange={field.onChange}
          error={fieldState.error?.message ?? error}
          buttonClassName="mt-0 h-10 w-full justify-start font-normal"
        />
      )}
    />
  );
}

function DancerDocumentTypeField({
  disabled = false,
  error,
  form,
}: {
  disabled?: boolean;
  error?: string;
  form: DancerFormReturn;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller
      control={form.control}
      name="documentType"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error || error ? true : undefined}>
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
                aria-invalid={fieldState.error || error ? true : undefined}
                aria-describedby={
                  fieldState.error || error ? errorId : undefined
                }
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
            <FieldError id={errorId}>
              {fieldState.error?.message ?? error}
            </FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function DancerStatusDialog({
  intent,
  onOpenChange,
}: {
  intent: DancerStatusIntent | null;
  onOpenChange: (open: boolean) => void;
}) {
  const action = intent ? dancerStatusActions[intent] : null;
  const isOpen = action !== null;
  const dialogFormId = getDancerStatusFormId(intent);

  return (
    <>
      {action ? (
        <div className="sr-only">
          <p>{action.confirmTitle}</p>
          <p>{action.confirmDescription}</p>
        </div>
      ) : null}
      <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
        {action ? (
          <AlertDialogContent forceMount>
            <AlertDialogHeader>
              <AlertDialogTitle>{action.confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {action.confirmDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form id={dialogFormId} method="post">
              <input type="hidden" name="intent" value={action.intent} />
            </form>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                form={dialogFormId}
                type="submit"
                variant={action.confirmButtonVariant}
              >
                {action.confirmButtonLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </>
  );
}

function getDancerStatusAction(isActive: boolean) {
  if (isActive) {
    return dancerStatusActions["archive-dancer"];
  }

  return dancerStatusActions["reactivate-dancer"];
}

function getDancerFieldAutoComplete(name: DancerTextFieldName) {
  switch (name) {
    case "firstName":
      return "given-name";
    case "lastName":
      return "family-name";
    case "documentBackImageStorageKey":
    case "documentFrontImageStorageKey":
    case "documentNumber":
      return "off";
  }
}

function getDancerStatusFormId(intent: DancerStatusIntent | null) {
  switch (intent) {
    case "archive-dancer":
      return "portal-bailarin-archive-form";
    case "reactivate-dancer":
      return "portal-bailarin-reactivate-form";
    case null:
      return "portal-bailarin-status-form";
  }
}

function getGeneralActionError(actionData?: ActionData) {
  if (!actionData || hasFieldErrors(actionData.fieldErrors)) {
    return null;
  }

  return {
    status: "error" as const,
    message: actionData.message,
  };
}

function hasFieldErrors(fieldErrors: DancerFieldErrors) {
  return Object.values(fieldErrors).some(Boolean);
}

function readDancerId(params: { dancerId?: string }) {
  if (!params.dancerId) {
    throw new Response(dancerNotFoundMessage, { status: 404 });
  }

  return params.dancerId;
}

async function requireDancer(academyId: string, dancerId: string) {
  const dancer = await findDancerForAcademy(academyId, dancerId);

  if (!dancer) {
    throw new Response(dancerNotFoundMessage, { status: 404 });
  }

  return dancer;
}

function readFormString(formData: FormData, key: UpdateDancerField | "intent") {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}
