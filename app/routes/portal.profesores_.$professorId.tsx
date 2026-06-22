import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, Check, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  Controller,
  useForm,
  type FieldPath,
  type UseFormReturn,
} from "react-hook-form";
import {
  Link,
  redirect,
  useActionData,
  useNavigation,
  useSubmit,
} from "react-router";
import { z } from "zod";

import type { PortalRouteHandle } from "@/components/portal/ui";
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
import {
  archiveAcademyProfessor,
  findAcademyProfessor,
  reactivateAcademyProfessor,
  updateAcademyProfessor,
  type UpdateProfessorInput,
} from "@/lib/portal/professors.server";
import {
  createValidatedReactRouterSubmitHandler,
  type ReactRouterFormSubmit,
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

const professorNotFoundMessage = "No encontramos ese Profesor.";
const formId = "portal-profesor-form";
const noDocumentTypeSelectValue = "sin-documento";

const professorSchema = z
  .object({
    firstName: z.string().trim().min(1, requiredFieldMessage),
    lastName: z.string().trim().min(1, requiredFieldMessage),
    documentType: z.string().trim(),
    documentNumber: z.string().trim(),
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
type ProfessorFormValues = z.infer<typeof professorSchema>;
type ProfessorFormReturn = UseFormReturn<
  ProfessorFormValues,
  unknown,
  ProfessorFormValues
>;
type ProfessorFieldErrors = NonNullable<ActionData["fieldErrors"]>;
type ProfessorStatusIntent = "archive-professor" | "reactivate-professor";
type ProfessorStatusAction = {
  intent: ProfessorStatusIntent;
  label: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmButtonLabel: string;
  confirmButtonVariant: "default" | "destructive";
};

const emptyProfessorFieldErrors: ProfessorFieldErrors = {};

const professorStatusActions = {
  "archive-professor": {
    intent: "archive-professor",
    label: "Archivar",
    confirmTitle: "¿Archivar profesor?",
    confirmDescription:
      "El profesor dejará de aparecer en listas activas y en próximas selecciones de coreografías. Sus coreografías existentes no se modifican.",
    confirmButtonLabel: "Archivar",
    confirmButtonVariant: "destructive",
  },
  "reactivate-professor": {
    intent: "reactivate-professor",
    label: "Reactivar",
    confirmTitle: "¿Reactivar profesor?",
    confirmDescription:
      "El profesor volverá a aparecer en listas activas y en próximas selecciones de coreografías. Sus coreografías existentes no se modifican.",
    confirmButtonLabel: "Reactivar",
    confirmButtonVariant: "default",
  },
} as const satisfies Record<ProfessorStatusIntent, ProfessorStatusAction>;

type PortalProfesorRouteProps = {
  loaderData: LoaderData;
  actionData?: ActionData;
  initialStatusDialogIntent?: ProfessorStatusIntent | null;
};

export const meta = () => [
  { title: "Editar profesor | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Profesores", to: "/portal/profesores" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      const professor = data?.professor;

      return professor
        ? { label: `${professor.firstName} ${professor.lastName}` }
        : null;
    },
  ],
} satisfies PortalRouteHandle;

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { professorId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const professorId = readProfessorId(params);
  const professor = await requireProfessor(academy.id, professorId);

  return {
    professor,
  };
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { professorId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const professorId = readProfessorId(params);

  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent === "archive-professor") {
    await archiveAcademyProfessor(academy.id, professorId);
    throw redirect(
      `/portal/profesores/${professorId}?notificacion=profesor-archivado`,
    );
  }

  if (intent === "reactivate-professor") {
    await reactivateAcademyProfessor(academy.id, professorId);
    throw redirect(
      `/portal/profesores/${professorId}?notificacion=profesor-reactivado`,
    );
  }

  if (intent !== "" && intent !== "update-professor") {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const result = await updateAcademyProfessor(academy.id, professorId, {
    firstName: readFormString(formData, "firstName"),
    lastName: readFormString(formData, "lastName"),
    documentType: readFormString(formData, "documentType"),
    documentNumber: readFormString(formData, "documentNumber"),
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values,
    };
  }

  throw redirect(
    `/portal/profesores/${professorId}?notificacion=profesor-guardado`,
  );
}

export function PortalProfesorRouteView({
  loaderData,
  actionData: actionDataOverride,
  initialStatusDialogIntent = null,
}: PortalProfesorRouteProps) {
  const actionData =
    actionDataOverride?.status === "error" ? actionDataOverride : undefined;
  const formValues = actionData?.values ?? {
    firstName: loaderData.professor.firstName,
    lastName: loaderData.professor.lastName,
    documentType: loaderData.professor.documentType ?? "",
    documentNumber: loaderData.professor.documentNumber ?? "",
  };
  const submit = useSubmit();
  const navigation = useNavigation();
  const form = useProfessorForm({
    fieldErrors: actionData?.fieldErrors,
    submit,
    values: formValues,
  });
  const [statusDialogIntent, setStatusDialogIntent] =
    useState<ProfessorStatusIntent | null>(initialStatusDialogIntent);
  const statusAction = getProfessorStatusAction(loaderData.professor.active);
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "update-professor";

  useServerActionToast(getGeneralActionError(actionData), {
    toastId: "portal-profesor-detail:error",
  });

  return (
    <>
      <section
        className="flex flex-col gap-6"
        aria-labelledby="profesor-detail-title"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 id="profesor-detail-title" className="text-xl font-semibold">
              Editar profesor
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Actualizá los datos de este profesor.
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

        <div className="flex flex-col gap-3">
          {!loaderData.professor.active ? (
            <Alert>
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>
                Este profesor está archivado. Reactivalo para que vuelva a
                aparecer en las listas activas y en próximas selecciones de
                coreografías.
              </AlertDescription>
              <AlertAction className="top-1/2 -translate-y-1/2">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setStatusDialogIntent("reactivate-professor");
                  }}
                >
                  Reactivar
                </Button>
              </AlertAction>
            </Alert>
          ) : null}
          {loaderData.professor.isIncomplete ? (
            <Alert>
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>
                Faltan datos de identificación.
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
              <input type="hidden" name="intent" value="update-professor" />
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <ProfessorTextField
                  form={form.form}
                  error={actionData?.fieldErrors.firstName}
                  label="Nombre"
                  name="firstName"
                />
                <ProfessorTextField
                  form={form.form}
                  error={actionData?.fieldErrors.lastName}
                  label="Apellido"
                  name="lastName"
                />
                <ProfessorDocumentTypeField
                  error={actionData?.fieldErrors.documentType}
                  form={form.form}
                />
                <ProfessorTextField
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
              <Link to="/portal/profesores">Volver</Link>
            </Button>
            <Button
              type="submit"
              form={formId}
              size="lg"
              disabled={isSubmitting}
            >
              <Check aria-hidden="true" data-icon="inline-start" />
              {isSubmitting ? "Guardando..." : "Guardar"}
            </Button>
          </CardFooter>
        </Card>
      </section>

      <ProfessorStatusDialog
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

export default function PortalProfesorRoute({
  loaderData,
}: PortalProfesorRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <PortalProfesorRouteView loaderData={loaderData} actionData={actionData} />
  );
}

function useProfessorForm({
  fieldErrors = emptyProfessorFieldErrors,
  submit,
  values,
}: {
  fieldErrors?: ProfessorFieldErrors;
  submit: ReactRouterFormSubmit;
  values: ProfessorFormValues;
}) {
  const form = useForm<ProfessorFormValues, unknown, ProfessorFormValues>({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(professorSchema),
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

  return {
    form,
    handleSubmit: createValidatedReactRouterSubmitHandler(form, submit, {
      method: "post",
    }),
  };
}

function ProfessorTextField({
  error,
  form,
  label,
  name,
}: {
  error?: string;
  form: ProfessorFormReturn;
  label: string;
  name: FieldPath<ProfessorFormValues>;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const autoComplete = getProfessorFieldAutoComplete(name);

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

function ProfessorDocumentTypeField({
  error,
  form,
}: {
  error?: string;
  form: ProfessorFormReturn;
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

function ProfessorStatusDialog({
  intent,
  onOpenChange,
}: {
  intent: ProfessorStatusIntent | null;
  onOpenChange: (open: boolean) => void;
}) {
  const action = intent ? professorStatusActions[intent] : null;
  const isOpen = action !== null;
  const dialogFormId = getProfessorStatusFormId(intent);

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
                  <ProfessorStatusActionIcon intent={action.intent} />
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

function ProfessorStatusActionIcon({
  intent,
}: {
  intent: ProfessorStatusIntent;
}) {
  if (intent === "archive-professor") {
    return <Archive aria-hidden="true" data-icon="inline-start" />;
  }

  return <RotateCcw aria-hidden="true" data-icon="inline-start" />;
}

function getProfessorStatusAction(isActive: boolean) {
  if (isActive) {
    return professorStatusActions["archive-professor"];
  }

  return professorStatusActions["reactivate-professor"];
}

function getProfessorFieldAutoComplete(name: FieldPath<ProfessorFormValues>) {
  switch (name) {
    case "firstName":
      return "given-name";
    case "lastName":
      return "family-name";
    case "documentNumber":
    case "documentType":
      return "off";
  }
}

function getProfessorStatusFormId(intent: ProfessorStatusIntent | null) {
  switch (intent) {
    case "archive-professor":
      return "portal-profesor-archive-form";
    case "reactivate-professor":
      return "portal-profesor-reactivate-form";
    case null:
      return "portal-profesor-status-form";
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

function hasFieldErrors(fieldErrors: ProfessorFieldErrors) {
  return Object.values(fieldErrors).some(Boolean);
}

function readProfessorId(params: { professorId?: string }) {
  if (!params.professorId) {
    throw new Response(professorNotFoundMessage, { status: 404 });
  }

  return params.professorId;
}

async function requireProfessor(academyId: string, professorId: string) {
  const professor = await findAcademyProfessor(academyId, professorId);

  if (!professor) {
    throw new Response(professorNotFoundMessage, { status: 404 });
  }

  return professor;
}

function readFormString(
  formData: FormData,
  key: keyof UpdateProfessorInput | "intent",
) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}
