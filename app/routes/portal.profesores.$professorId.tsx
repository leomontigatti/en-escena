import { zodResolver } from "@hookform/resolvers/zod";
import { Ellipsis, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  Controller,
  useForm,
  type FieldPath,
  type UseFormReturn,
} from "react-hook-form";
import { Link, redirect, useActionData } from "react-router";
import { z } from "zod";

import { PortalShell } from "@/components/portal/ui";
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
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { getPortalEventContext } from "@/lib/portal/event-context.server";
import {
  archiveAcademyProfessor,
  findAcademyProfessor,
  reactivateAcademyProfessor,
  updateAcademyProfessor,
  type UpdateProfessorInput,
} from "@/lib/portal/professors.server";
import {
  createValidatedNativeSubmitHandler,
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

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { professorId?: string };
}) {
  const { user, academy } = await requireAcademyUser(request);
  const professorId = readProfessorId(params);
  const [eventContext, professor] = await Promise.all([
    getPortalEventContext(request),
    requireProfessor(academy.id, professorId),
  ]);

  return {
    email: user.email,
    userName: user.name ?? "",
    academy,
    eventContext,
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
  const form = useProfessorForm({
    fieldErrors: actionData?.fieldErrors,
    values: formValues,
  });
  const [statusDialogIntent, setStatusDialogIntent] =
    useState<ProfessorStatusIntent | null>(initialStatusDialogIntent);
  const statusAction = getProfessorStatusAction(loaderData.professor.active);

  useServerActionToast(getGeneralActionError(actionData), {
    toastId: "portal-profesor-detail:error",
  });

  return (
    <PortalShell
      userEmail={loaderData.email}
      userName={loaderData.userName}
      academyName={loaderData.academy.name}
      eventContext={loaderData.eventContext}
      title="Profesores"
      breadcrumbItems={[
        { label: "Profesores", to: "/portal/profesores" },
        {
          label: `${loaderData.professor.lastName}, ${loaderData.professor.firstName}`,
        },
      ]}
    >
      <section className="space-y-6" aria-labelledby="profesor-detail-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 id="profesor-detail-title" className="text-xl font-semibold">
              Editar profesor
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Actualizá los datos de este profesor.
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
          <CardContent className="space-y-6">
            <div className="space-y-3">
              {!loaderData.professor.active ? (
                <Alert>
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>
                    Este profesor está archivado. Reactivalo para que vuelva a
                    aparecer en las listas activas y en próximas selecciones de
                    coreografías.
                  </AlertDescription>
                  <AlertAction>
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
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button asChild variant="outline" size="lg">
            <Link to="/portal/profesores">Volver</Link>
          </Button>
          <Button type="submit" form={formId} size="lg">
            Guardar
          </Button>
        </div>
      </section>

      <ProfessorStatusDialog
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
  values,
}: {
  fieldErrors?: ProfessorFieldErrors;
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

  return { form, handleSubmit: createValidatedNativeSubmitHandler(form) };
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
