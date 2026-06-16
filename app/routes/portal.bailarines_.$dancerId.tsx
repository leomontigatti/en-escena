import { zodResolver } from "@hookform/resolvers/zod";
import {
  Archive,
  Check,
  Ellipsis,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import { Link, redirect, useActionData } from "react-router";
import { z } from "zod";

import type { PortalRouteHandle } from "@/components/portal/ui";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
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
  const dancerId = readDancerId(params);
  const dancer = await requireDancer(academy.id, dancerId);

  return {
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
  const hasDocumentData = Boolean(
    loaderData.dancer.documentType && loaderData.dancer.documentNumber,
  );
  const showsIdentificationAlert = !hasDocumentData;
  const showsMissingImagesAlert = hasDocumentData;

  useServerActionToast(getGeneralActionError(actionData), {
    toastId: "portal-bailarin-detail:error",
  });

  return (
    <>
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-lg"
                      aria-label="Acciones"
                    >
                      <Ellipsis aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="left">Acciones</TooltipContent>
              </Tooltip>
            </TooltipProvider>
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

        <div className="flex flex-col gap-3">
          {!loaderData.dancer.active ? (
            <Alert>
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>
                Este bailarín está archivado. Reactivalo para que vuelva a
                aparecer en las listas activas y en próximas selecciones de
                coreografías.
              </AlertDescription>
              <AlertAction className="top-1/2 -translate-y-1/2">
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
                Faltan datos de identificación para completar la verificación.
              </AlertDescription>
            </Alert>
          ) : null}
          {showsMissingImagesAlert ? (
            <Alert>
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>
                Faltan imágenes del documento para completar la verificación.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <Card>
          <CardContent>
            <form
              id={formId}
              method="post"
              noValidate
              onSubmit={form.handleSubmit}
            >
              <input type="hidden" name="intent" value="update-dancer" />
              <input
                type="hidden"
                name="documentFrontImageStorageKey"
                defaultValue={formValues.documentFrontImageStorageKey}
              />
              <input
                type="hidden"
                name="documentBackImageStorageKey"
                defaultValue={formValues.documentBackImageStorageKey}
              />
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <DancerTextField
                  form={form.form}
                  error={actionData?.fieldErrors.firstName}
                  label="Nombre"
                  name="firstName"
                />
                <DancerTextField
                  form={form.form}
                  error={actionData?.fieldErrors.lastName}
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
                />
                <DancerTextField
                  form={form.form}
                  error={actionData?.fieldErrors.documentNumber}
                  label="Número de documento"
                  name="documentNumber"
                />
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
            <Button asChild variant="outline" size="lg">
              <Link to="/portal/bailarines">Volver</Link>
            </Button>
            <Button type="submit" form={formId} size="lg">
              <Check aria-hidden="true" data-icon="inline-start" />
              Guardar
            </Button>
          </CardFooter>
        </Card>
      </section>

      <DancerStatusDialog
        intent={statusDialogIntent}
        onOpenChange={(open) => {
          if (!open) {
            setStatusDialogIntent(null);
          }
        }}
      />
    </>
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
  error,
  form,
  label,
  name,
}: {
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
          buttonClassName="mt-0 h-8 w-full justify-start font-normal"
        />
      )}
    />
  );
}

function DancerDocumentTypeField({
  error,
  form,
}: {
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
          <AlertDialogContent
            forceMount
            className="w-[calc(100%-2rem)] max-w-lg gap-4 p-6 sm:max-w-lg"
          >
            <AlertDialogHeader className="flex flex-col items-start gap-1.5 text-left">
              <AlertDialogTitle>{action.confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {action.confirmDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="m-0 rounded-none border-0 bg-transparent p-0">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <form id={dialogFormId} method="post">
                <input type="hidden" name="intent" value={action.intent} />
                <Button type="submit" variant={action.confirmButtonVariant}>
                  <DancerStatusActionIcon intent={action.intent} />
                  {action.confirmButtonLabel}
                </Button>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </>
  );
}

function DancerStatusActionIcon({ intent }: { intent: DancerStatusIntent }) {
  if (intent === "archive-dancer") {
    return <Archive aria-hidden="true" data-icon="inline-start" />;
  }

  return <RotateCcw aria-hidden="true" data-icon="inline-start" />;
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
