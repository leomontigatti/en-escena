import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, RotateCcw, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useForm, type FieldPath, type UseFormReturn } from "react-hook-form";
import {
  Form,
  useNavigation,
  useSubmit,
  type SubmitFunction,
} from "react-router";

import { FormActions } from "@/components/shared/form-actions";
import { RosterNameWarningDialog } from "@/components/shared/roster-name-warning";
import { AlertStack } from "@/components/shared/alert-stack";
import { ArchivedPersonAlert } from "@/components/shared/archived-person-alert";
import { useRosterDocumentConflictField } from "@/components/shared/roster-document-conflict";
import {
  documentTypeEmptyLabel,
  documentTypeOptions,
} from "@/components/shared/document-type-options";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { RosterPersonParticipatingAlert } from "@/components/shared/roster-person-participating-alert";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  createValidatedReactRouterSubmitHandler,
  isRouteFormPending,
  useCloseOnceSettled,
  useSavedFormValues,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";
import { useRecordTitleDetailTransitionStyle } from "@/lib/shared/view-transitions";
import {
  archiveProfessorIntent,
  buildPortalProfessorDetailViewModel,
  getPortalProfessorDocumentConflict,
  portalProfessorStatusActions,
  professorDetailFormId,
  splitPortalProfessorActionData,
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
  // A warning keeps the form as it was submitted and asks the academy to
  // confirm, so the values it carries are shown back as an error's are.
  const {
    error: actionData,
    nameWarning,
    success: successData,
  } = splitPortalProfessorActionData(actionDataOverride);
  const savedValues: ProfessorFormValues = {
    firstName: loaderData.professor.firstName,
    lastName: loaderData.professor.lastName,
    documentType: loaderData.professor.documentType ?? "",
    documentNumber: loaderData.professor.documentNumber ?? "",
  };
  const formValues = actionData?.values ?? nameWarning?.values ?? savedValues;
  const submit = useSubmit();
  const navigation = useNavigation();
  const form = useProfessorForm({
    savedValues,
    submit,
    values: formValues,
  });
  const documentConflictDescription = useRosterDocumentConflictField({
    actionData,
    conflict: getPortalProfessorDocumentConflict(actionData),
    name: "documentNumber",
    setError: form.form.setError,
  });
  const [statusDialogIntent, setStatusDialogIntent] =
    useState<ProfessorStatusIntent | null>(initialStatusDialogIntent);
  const { participatingAlert, statusAction } =
    buildPortalProfessorDetailViewModel({
      active: loaderData.professor.active,
      isParticipatingInActiveEvent: loaderData.isParticipatingInActiveEvent,
    });
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === updateProfessorIntent;
  const detailHref = `/portal/profesores/${loaderData.professor.id}`;
  const viewTransitionStyle = useRecordTitleDetailTransitionStyle({
    detailHref,
    listHref: "/portal/profesores",
  });
  const title = `${loaderData.professor.firstName} ${loaderData.professor.lastName}`;

  useServerActionToast(getGeneralActionError(actionData), {
    toastId: "portal-profesor-detail:error",
  });
  useServerActionToast(successData, {
    toastId: "portal-profesor-detail:success",
  });

  return (
    <>
      <section
        className="flex flex-1 flex-col gap-6"
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
              disabled={statusAction.disabled}
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

        <PortalProfessorAlertsSection
          isIncomplete={loaderData.professor.isIncomplete}
          onReactivate={() => {
            setStatusDialogIntent(reactivateProfessorIntent);
          }}
          participatingAlert={participatingAlert}
          professorActive={loaderData.professor.active}
        />

        <Card className="overflow-clip">
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
                  description={documentConflictDescription}
                  form={form.form}
                  label="Número de documento"
                  name="documentNumber"
                />
              </FieldGroup>
            </form>
          </CardContent>
          <FormActions
            backTo="/portal/profesores"
            form={professorDetailFormId}
            hasChanges={form.form.formState.isDirty}
            isPending={isSubmitting}
            onDiscard={form.discard}
            viewTransition
          />
        </Card>
        {nameWarning ? (
          <RosterNameWarningDialog
            formId={professorDetailFormId}
            isPending={isSubmitting}
            warning={nameWarning.warning}
          />
        ) : null}
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

function PortalProfessorAlertsSection({
  isIncomplete,
  onReactivate,
  participatingAlert,
  professorActive,
}: {
  isIncomplete: boolean;
  onReactivate: () => void;
  participatingAlert: string | null;
  professorActive: boolean;
}) {
  return (
    <AlertStack>
      {!professorActive ? (
        <ArchivedPersonAlert
          personLabel="profesor"
          onReactivate={onReactivate}
        />
      ) : null}
      {participatingAlert ? (
        <RosterPersonParticipatingAlert message={participatingAlert} />
      ) : null}
      {isIncomplete ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Faltan datos de identificación</AlertTitle>
          <AlertDescription>
            Completá el tipo y el número de documento.
          </AlertDescription>
        </Alert>
      ) : null}
    </AlertStack>
  );
}

/**
 * `savedValues` is what "changed" is measured against; `values` is what the
 * form shows, which after a refused save is what was typed and still reads as
 * changed ({@link useSavedFormValues}).
 */
function useProfessorForm({
  savedValues,
  submit,
  values,
}: {
  savedValues: ProfessorFormValues;
  submit: SubmitFunction;
  values: ProfessorFormValues;
}) {
  const form = useForm<ProfessorFormValues, unknown, ProfessorFormValues>({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(professorSchema),
  });
  useSavedFormValues(form, savedValues, values);

  return {
    discard: () => form.reset(savedValues),
    form,
    handleSubmit: createValidatedReactRouterSubmitHandler(form, submit, {
      method: "post",
    }),
  };
}

function ProfessorTextField({
  description,
  form,
  label,
  name,
}: {
  description?: ReactNode;
  form: ProfessorFormReturn;
  label: string;
  name: FieldPath<ProfessorFormValues>;
}) {
  const autoComplete = getProfessorFieldAutoComplete(name);

  return (
    <TextInputField
      autoComplete={autoComplete}
      control={form.control}
      description={description}
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
  const action = intent ? portalProfessorStatusActions[intent] : null;
  const isOpen = action !== null;
  const dialogFormId = getProfessorStatusFormId(intent);
  const navigation = useNavigation();
  const isPending =
    action !== null &&
    isRouteFormPending(navigation, { intent: action.intent });

  useCloseOnceSettled({ isPending, onClose: () => onOpenChange(false) });

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
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>
                Cancelar
              </AlertDialogCancel>
              <Form id={dialogFormId} method="post">
                <input type="hidden" name="intent" value={action.intent} />
                <Button
                  type="submit"
                  variant={action.confirmButtonVariant}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Spinner aria-hidden="true" data-icon="inline-start" />
                  ) : (
                    <ProfessorStatusActionIcon intent={action.intent} />
                  )}
                  {action.confirmButtonLabel}
                </Button>
              </Form>
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

function getGeneralActionError(
  actionData?: Extract<ActionData, { status: "error" }>,
) {
  if (!actionData) {
    return null;
  }

  return {
    status: "error" as const,
    message: actionData.message,
  };
}
