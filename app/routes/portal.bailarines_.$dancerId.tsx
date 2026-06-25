import { zodResolver } from "@hookform/resolvers/zod";
import {
  Archive,
  CircleAlert,
  Info,
  Lock,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import {
  Link,
  redirect,
  useActionData,
  useNavigation,
  useSubmit,
} from "react-router";
import { z } from "zod";

import type { PortalRouteHandle } from "@/components/portal/ui";
import { SubmitButton } from "@/components/shared/action-buttons";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { FileUploadField } from "@/components/shared/file-upload-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
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
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { getDancerVerificationStatus } from "@/lib/dancers/verification";
import {
  archiveDancerForAcademy,
  findDancerForAcademy,
  reactivateDancerForAcademy,
  updateDancerForAcademy,
  type UpdateDancerField,
} from "@/lib/portal/dancers.server";
import {
  createValidatedReactRouterSubmitHandler,
  type ReactRouterFormSubmit,
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import { createDefaultDancerDocumentStorage } from "@/lib/storage/dancer-documents.server";
import { useServerActionToast } from "@/lib/shared/toasts";
import { usePortalRecordTitleDetailTransitionStyle } from "@/lib/shared/view-transitions";

const dancerNotFoundMessage = "No encontramos ese Bailarín.";
const dancerDocumentImageAccept = "image/jpeg,image/png,image/webp";
const dancerDocumentImageAllowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
];
const dancerDocumentImageMaxFileSizeBytes = 10 * 1024 * 1024;
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
  const documentImageUrls = await loadDancerDocumentImageUrls(dancer);

  return {
    dancer,
    documentImageUrls,
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

  const submittedValues = {
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
  };
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

  const documentImageStorageKeys = await resolveDancerDocumentImageStorageKeys({
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
  const submit = useSubmit();
  const navigation = useNavigation();
  const form = useDancerForm({
    fieldErrors: actionData?.fieldErrors,
    submit,
    values: formValues,
  });
  const [statusDialogIntent, setStatusDialogIntent] =
    useState<DancerStatusIntent | null>(initialStatusDialogIntent);
  const statusAction = getDancerStatusAction(loaderData.dancer.active);
  const verificationStatus = getDancerVerificationStatus(loaderData.dancer);
  const isIdentityVerified = verificationStatus === "verified";
  const identityFieldValues = isIdentityVerified
    ? {
        birthDate: loaderData.dancer.birthDate,
        documentType: loaderData.dancer.documentType ?? "",
        documentNumber: loaderData.dancer.documentNumber ?? "",
      }
    : formValues;
  const showsIdentificationAlert = verificationStatus === "incomplete";
  const showsPendingVerificationAlert = verificationStatus === "unverified";
  const showsStatusAlerts =
    !loaderData.dancer.active ||
    showsIdentificationAlert ||
    showsPendingVerificationAlert;
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "update-dancer";
  const detailHref = `/portal/bailarines/${loaderData.dancer.id}`;
  const viewTransitionStyle = usePortalRecordTitleDetailTransitionStyle({
    detailHref,
    listHref: "/portal/bailarines",
  });
  const title = `${loaderData.dancer.firstName} ${loaderData.dancer.lastName}`;

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
            <h1
              id="bailarin-detail-title"
              className="text-xl font-semibold"
              style={viewTransitionStyle}
            >
              {title}
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Actualizá los datos de este bailarín.
            </p>
          </div>
          <ResourceActionsMenu contentClassName="w-40">
            <DropdownMenuItem
              variant={statusAction.confirmButtonVariant}
              onSelect={(event) => {
                event.preventDefault();
                setStatusDialogIntent(statusAction.intent);
              }}
            >
              {statusAction.label}
            </DropdownMenuItem>
          </ResourceActionsMenu>
        </div>

        {showsStatusAlerts ? (
          <div className="flex flex-col gap-3">
            {!loaderData.dancer.active ? (
              <Alert variant="destructive">
                <CircleAlert aria-hidden="true" />
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
              <Alert variant="warning">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>
                  Completá los datos e imágenes del documento para poder
                  verificar la identidad del bailarín.
                </AlertDescription>
              </Alert>
            ) : null}
            {showsPendingVerificationAlert ? (
              <Alert variant="info">
                <Info aria-hidden="true" />
                <AlertDescription>
                  La identidad del bailarín está sin verificar.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}

        <Card>
          <CardContent>
            <form
              id={formId}
              method="post"
              encType="multipart/form-data"
              noValidate
              onSubmit={form.handleSubmit}
            >
              <input type="hidden" name="intent" value="update-dancer" />
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
                {isIdentityVerified ? (
                  <ReadonlyLockedFormField
                    label="Fecha de nacimiento"
                    name="birthDate"
                    value={identityFieldValues.birthDate}
                    displayValue={formatDateOnlyLabel(
                      identityFieldValues.birthDate,
                    )}
                  />
                ) : (
                  <DancerBirthDateField
                    form={form.form}
                    error={actionData?.fieldErrors.birthDate}
                  />
                )}
                <div className="hidden md:block" aria-hidden="true" />
                {isIdentityVerified ? (
                  <ReadonlyLockedFormField
                    label="Tipo de documento"
                    name="documentType"
                    value={identityFieldValues.documentType}
                    displayValue={formatDocumentTypeLabel(
                      identityFieldValues.documentType,
                    )}
                  />
                ) : (
                  <DancerDocumentTypeField
                    form={form.form}
                    error={actionData?.fieldErrors.documentType}
                  />
                )}
                {isIdentityVerified ? (
                  <ReadonlyLockedFormField
                    label="Número de documento"
                    name="documentNumber"
                    value={identityFieldValues.documentNumber}
                  />
                ) : (
                  <DancerTextField
                    form={form.form}
                    error={actionData?.fieldErrors.documentNumber}
                    label="Número de documento"
                    name="documentNumber"
                  />
                )}
                {isIdentityVerified ? (
                  <>
                    <ReadonlyLockedFormField
                      label="Frente del documento"
                      name="documentFrontImageStorageKey"
                      value={formValues.documentFrontImageStorageKey}
                      displayValue={getDocumentImageStateLabel(
                        formValues.documentFrontImageStorageKey,
                      )}
                    />
                    <ReadonlyLockedFormField
                      label="Dorso del documento"
                      name="documentBackImageStorageKey"
                      value={formValues.documentBackImageStorageKey}
                      displayValue={getDocumentImageStateLabel(
                        formValues.documentBackImageStorageKey,
                      )}
                    />
                  </>
                ) : (
                  <DancerDocumentImageFields
                    form={form.form}
                    formValues={formValues}
                    imageUrls={loaderData.documentImageUrls}
                  />
                )}
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
            <Button asChild variant="outline" size="lg">
              <Link to="/portal/bailarines" viewTransition>
                Volver
              </Link>
            </Button>
            <SubmitButton form={formId} size="lg" isPending={isSubmitting} />
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
  submit,
  values,
}: {
  fieldErrors?: DancerFieldErrors;
  submit: ReactRouterFormSubmit;
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

  return {
    form,
    handleSubmit: createValidatedReactRouterSubmitHandler(form, submit, {
      encType: "multipart/form-data",
      method: "post",
    }),
  };
}

function ReadonlyLockedFormField({
  displayValue,
  label,
  name,
  value,
}: {
  displayValue?: string;
  label: string;
  name: string;
  value: string;
}) {
  const id = useId();

  return (
    <Field data-disabled>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        <input type="hidden" name={name} value={value} />
        <div className="relative">
          <Input
            id={id}
            value={displayValue ?? value}
            disabled
            readOnly
            className="pr-9"
          />
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </FieldContent>
    </Field>
  );
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
          buttonClassName="mt-0 h-8 w-full font-normal"
          endMonth={new Date()}
          startMonth={new Date(1900, 0)}
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

function DancerDocumentImageFields({
  form,
  formValues,
  imageUrls,
}: {
  form: DancerFormReturn;
  formValues: DancerFormValues;
  imageUrls: LoaderData["documentImageUrls"];
}) {
  const frontImageId = useId();
  const backImageId = useId();
  const [frontImageHasError, setFrontImageHasError] = useState(false);
  const [backImageHasError, setBackImageHasError] = useState(false);
  const handleFrontImageValidationErrorChange = useCallback(
    (hasError: boolean) => {
      setFrontImageHasError(hasError);
    },
    [],
  );
  const handleBackImageValidationErrorChange = useCallback(
    (hasError: boolean) => {
      setBackImageHasError(hasError);
    },
    [],
  );
  const handleFrontImageStorageKeyChange = useCallback(
    (storageKey: string) => {
      form.setValue("documentFrontImageStorageKey", storageKey, {
        shouldDirty: true,
      });
    },
    [form],
  );
  const handleBackImageStorageKeyChange = useCallback(
    (storageKey: string) => {
      form.setValue("documentBackImageStorageKey", storageKey, {
        shouldDirty: true,
      });
    },
    [form],
  );

  return (
    <>
      <Field data-invalid={frontImageHasError ? true : undefined}>
        <FieldLabel htmlFor={frontImageId}>Frente del documento</FieldLabel>
        <FieldContent>
          <FileUploadField
            id={frontImageId}
            name="documentFrontImage"
            existingPreviewUrl={imageUrls.front}
            storageKeyInputName="documentFrontImageStorageKey"
            storageKeyValue={formValues.documentFrontImageStorageKey}
            label="Arrastrá o hacé click"
            helperText="JPG, PNG o WEBP - max 10 MB"
            accept={dancerDocumentImageAccept}
            allowedMimeTypes={dancerDocumentImageAllowedMimeTypes}
            maxFileSizeBytes={dancerDocumentImageMaxFileSizeBytes}
            onStorageKeyChange={handleFrontImageStorageKeyChange}
            onValidationErrorChange={handleFrontImageValidationErrorChange}
          />
        </FieldContent>
      </Field>
      <Field data-invalid={backImageHasError ? true : undefined}>
        <FieldLabel htmlFor={backImageId}>Dorso del documento</FieldLabel>
        <FieldContent>
          <FileUploadField
            id={backImageId}
            name="documentBackImage"
            existingPreviewUrl={imageUrls.back}
            storageKeyInputName="documentBackImageStorageKey"
            storageKeyValue={formValues.documentBackImageStorageKey}
            label="Arrastrá o hacé click"
            helperText="JPG, PNG o WEBP - max 10 MB"
            accept={dancerDocumentImageAccept}
            allowedMimeTypes={dancerDocumentImageAllowedMimeTypes}
            maxFileSizeBytes={dancerDocumentImageMaxFileSizeBytes}
            onStorageKeyChange={handleBackImageStorageKeyChange}
            onValidationErrorChange={handleBackImageValidationErrorChange}
          />
        </FieldContent>
      </Field>
    </>
  );
}

function getDocumentImageStateLabel(storageKey: string) {
  return storageKey ? "Imagen cargada" : "Sin imagen";
}

function formatDateOnlyLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  const monthNames = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];

  return `${day} de ${monthNames[month - 1]} de ${year}`;
}

function formatDocumentTypeLabel(value: string) {
  switch (value) {
    case "dni":
      return "DNI";
    case "passport":
      return "Pasaporte";
    case "other":
      return "Otro";
    default:
      return "";
  }
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

function getClientDocumentImageValidationMessage(formData: FormData) {
  const frontError = readFormString(
    formData,
    "documentFrontImageValidationError",
  );

  if (frontError) {
    return frontError;
  }

  const backError = readFormString(
    formData,
    "documentBackImageValidationError",
  );

  return backError || null;
}

async function requireDancer(academyId: string, dancerId: string) {
  const dancer = await findDancerForAcademy(academyId, dancerId);

  if (!dancer) {
    throw new Response(dancerNotFoundMessage, { status: 404 });
  }

  return dancer;
}

async function loadDancerDocumentImageUrls(
  dancer: Awaited<ReturnType<typeof requireDancer>>,
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

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

async function resolveDancerDocumentImageStorageKeys(input: {
  academyId: string;
  dancerId: string;
  formData: FormData;
}): Promise<
  | { ok: true; keys: { back: string; front: string } }
  | { ok: false; message: string }
> {
  const storage = createDefaultDancerDocumentStorage();
  const frontImage = readOptionalFormFile(input.formData, "documentFrontImage");
  const backImage = readOptionalFormFile(input.formData, "documentBackImage");
  const frontStorageKey = await uploadOptionalDancerDocumentImage({
    academyId: input.academyId,
    dancerId: input.dancerId,
    fallbackStorageKey: readFormString(
      input.formData,
      "documentFrontImageStorageKey",
    ),
    file: frontImage,
    side: "front",
    storage,
  });

  if (!frontStorageKey.ok) {
    return frontStorageKey;
  }

  const backStorageKey = await uploadOptionalDancerDocumentImage({
    academyId: input.academyId,
    dancerId: input.dancerId,
    fallbackStorageKey: readFormString(
      input.formData,
      "documentBackImageStorageKey",
    ),
    file: backImage,
    side: "back",
    storage,
  });

  if (!backStorageKey.ok) {
    return backStorageKey;
  }

  return {
    ok: true,
    keys: {
      back: backStorageKey.storageKey,
      front: frontStorageKey.storageKey,
    },
  };
}

async function uploadOptionalDancerDocumentImage(input: {
  academyId: string;
  dancerId: string;
  fallbackStorageKey: string;
  file: File | null;
  side: "back" | "front";
  storage: ReturnType<typeof createDefaultDancerDocumentStorage>;
}): Promise<{ ok: true; storageKey: string } | { ok: false; message: string }> {
  if (!input.file) {
    return { ok: true, storageKey: input.fallbackStorageKey };
  }

  try {
    return {
      ok: true,
      storageKey: await input.storage.uploadDocumentImage({
        academyId: input.academyId,
        dancerId: input.dancerId,
        file: input.file,
        side: input.side,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      message: getDocumentImageUploadErrorMessage(error, input.side),
    };
  }
}

function readOptionalFormFile(formData: FormData, key: string) {
  const value = formData.get(key);

  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  return value;
}

function getDocumentImageUploadErrorMessage(
  error: unknown,
  side: "back" | "front",
) {
  const fieldLabel = side === "front" ? "frente" : "dorso";

  if (
    error instanceof Error &&
    error.message === "Document image must be 10 MB or smaller."
  ) {
    return `El archivo del ${fieldLabel} no puede superar 10 MB.`;
  }

  if (
    error instanceof Error &&
    error.message === "Document image must be a JPEG, PNG, or WebP file."
  ) {
    return `El archivo del ${fieldLabel} debe ser JPG, PNG o WEBP.`;
  }

  return `No pudimos subir el archivo del ${fieldLabel}. Intentá nuevamente.`;
}
