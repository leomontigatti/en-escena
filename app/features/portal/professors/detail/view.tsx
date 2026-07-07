import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, type FieldPath, type UseFormReturn } from "react-hook-form";
import { Link, useNavigation, useSubmit } from "react-router";

import { SubmitButton } from "@/components/shared/action-buttons";
import { AlertStack } from "@/components/shared/alert-stack";
import { ArchivedPersonAlert } from "@/components/shared/archived-person-alert";
import {
  documentTypeEmptyLabel,
  documentTypeOptions,
} from "@/components/shared/document-type-options";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { FieldGroup } from "@/components/ui/field";
import {
  createValidatedReactRouterSubmitHandler,
  type ReactRouterFormSubmit,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";
import { usePortalRecordTitleDetailTransitionStyle } from "@/lib/shared/view-transitions";
import {
  archiveProfessorIntent,
  professorDetailFormId,
  professorSchema,
  reactivateProfessorIntent,
  updateProfessorIntent,
  type PortalProfessorDetailActionData,
  type PortalProfessorDetailLoaderData,
  type ProfessorFormValues,
  type ProfessorStatusIntent,
} from "@/features/portal/professors/detail/shared";

type LoaderData = PortalProfessorDetailLoaderData;
type ActionData = Exclude<PortalProfessorDetailActionData, undefined>;
type ProfessorFormReturn = UseFormReturn<
  ProfessorFormValues,
  unknown,
  ProfessorFormValues
>;
type ProfessorStatusAction = {
  intent: ProfessorStatusIntent;
  label: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmButtonLabel: string;
  confirmButtonVariant: "default" | "destructive";
};

const professorStatusActions = {
  [archiveProfessorIntent]: {
    intent: archiveProfessorIntent,
    label: "Archivar",
    confirmTitle: "¿Archivar profesor?",
    confirmDescription:
      "El profesor dejará de aparecer en listas activas y en próximas selecciones de coreografías. Sus coreografías existentes no se modifican.",
    confirmButtonLabel: "Archivar",
    confirmButtonVariant: "destructive",
  },
  [reactivateProfessorIntent]: {
    intent: reactivateProfessorIntent,
    label: "Reactivar",
    confirmTitle: "¿Reactivar profesor?",
    confirmDescription:
      "El profesor volverá a aparecer en listas activas y en próximas selecciones de coreografías. Sus coreografías existentes no se modifican.",
    confirmButtonLabel: "Reactivar",
    confirmButtonVariant: "default",
  },
} as const satisfies Record<ProfessorStatusIntent, ProfessorStatusAction>;

export type PortalProfessorDetailRouteViewProps = {
  loaderData: LoaderData;
  actionData?: ActionData;
  initialStatusDialogIntent?: ProfessorStatusIntent | null;
};

export function PortalProfessorDetailRouteView({
  loaderData,
  actionData: actionDataOverride,
  initialStatusDialogIntent = null,
}: PortalProfessorDetailRouteViewProps) {
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
    submit,
    values: formValues,
  });
  const [statusDialogIntent, setStatusDialogIntent] =
    useState<ProfessorStatusIntent | null>(initialStatusDialogIntent);
  const statusAction = getProfessorStatusAction(loaderData.professor.active);
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === updateProfessorIntent;
  const detailHref = `/portal/profesores/${loaderData.professor.id}`;
  const viewTransitionStyle = usePortalRecordTitleDetailTransitionStyle({
    detailHref,
    listHref: "/portal/profesores",
  });
  const title = `${loaderData.professor.firstName} ${loaderData.professor.lastName}`;

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
            <h1
              id="profesor-detail-title"
              className="text-xl font-semibold"
              style={viewTransitionStyle}
            >
              {title}
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

        <AlertStack>
          {!loaderData.professor.active ? (
            <ArchivedPersonAlert
              personLabel="profesor"
              onReactivate={() => {
                setStatusDialogIntent(reactivateProfessorIntent);
              }}
            />
          ) : null}
          {loaderData.professor.isIncomplete ? (
            <Alert variant="warning">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>
                Faltan datos de identificación.
              </AlertDescription>
            </Alert>
          ) : null}
        </AlertStack>

        <Card>
          <CardContent>
            <form
              id={professorDetailFormId}
              method="post"
              noValidate
              onSubmit={form.handleSubmit}
            >
              <input
                type="hidden"
                name="intent"
                value={updateProfessorIntent}
              />
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <ProfessorTextField
                  form={form.form}
                  label="Nombre"
                  name="firstName"
                />
                <ProfessorTextField
                  form={form.form}
                  label="Apellido"
                  name="lastName"
                />
                <SelectField
                  allowEmpty
                  control={form.form.control}
                  emptyLabel={documentTypeEmptyLabel}
                  label="Tipo de documento"
                  name="documentType"
                  options={documentTypeOptions}
                  placeholder={documentTypeEmptyLabel}
                />
                <ProfessorTextField
                  form={form.form}
                  label="Número de documento"
                  name="documentNumber"
                />
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
            <Button asChild variant="outline" size="lg">
              <Link to="/portal/profesores" viewTransition>
                Volver
              </Link>
            </Button>
            <SubmitButton
              form={professorDetailFormId}
              size="lg"
              isPending={isSubmitting}
            />
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

function useProfessorForm({
  submit,
  values,
}: {
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

  return {
    form,
    handleSubmit: createValidatedReactRouterSubmitHandler(form, submit, {
      method: "post",
    }),
  };
}

function ProfessorTextField({
  form,
  label,
  name,
}: {
  form: ProfessorFormReturn;
  label: string;
  name: FieldPath<ProfessorFormValues>;
}) {
  const autoComplete = getProfessorFieldAutoComplete(name);

  return (
    <TextInputField
      autoComplete={autoComplete}
      control={form.control}
      label={label}
      name={name}
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
  if (intent === archiveProfessorIntent) {
    return <Archive aria-hidden="true" data-icon="inline-start" />;
  }

  return <RotateCcw aria-hidden="true" data-icon="inline-start" />;
}

function getProfessorStatusAction(isActive: boolean) {
  if (isActive) {
    return professorStatusActions[archiveProfessorIntent];
  }

  return professorStatusActions[reactivateProfessorIntent];
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
    case archiveProfessorIntent:
      return "portal-profesor-archive-form";
    case reactivateProfessorIntent:
      return "portal-profesor-reactivate-form";
    case null:
      return "portal-profesor-status-form";
  }
}

function getGeneralActionError(actionData?: ActionData) {
  if (!actionData) {
    return null;
  }

  return {
    status: "error" as const,
    message: actionData.message,
  };
}
