import { Check, Pencil, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { ArchivedPersonAlert } from "@/components/shared/archived-person-alert";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { useServerActionToast } from "@/lib/shared/toasts";

import { ProfessorConfirmationDialog } from "./confirmation-dialog";
import {
  ProfessorActionsMenu,
  ProfessorDocumentTypeField,
  ProfessorTextField,
  ReadOnlyField,
  useProfessorEditForm,
  useProfessorReasonForm,
} from "./form";
import {
  formatProfessorDocumentType,
  getInitialDialogIntent,
  getProfessorConfirmationAction,
  getProfessorEditValues,
  getProfessorReasonValues,
  getSubmittedProfessorUpdateValues,
  type ProfessorActionError,
  type ProfessorDetailLoaderData,
  type ProfessorDialogIntent,
  type ProfessorEditFormValues,
  toProfessorEditValues,
} from "./shared";

export type AdministracionProfesorDetalleRouteViewProps = {
  actionData?: ProfessorActionError;
  loaderData: ProfessorDetailLoaderData;
};

export function AdministracionProfesorDetalleRouteView({
  actionData,
  loaderData,
}: AdministracionProfesorDetalleRouteViewProps) {
  useServerActionToast(actionData, {
    toastId: "admin-professor-detail:error",
  });

  const professor = loaderData.professor;
  const isEditing =
    loaderData.canEdit && (loaderData.isEditing || Boolean(actionData));
  const submittedUpdateValues = getSubmittedProfessorUpdateValues(actionData);
  const editValues = getProfessorEditValues({ actionData, professor });
  const reasonValues = getProfessorReasonValues(actionData);
  const editForm = useProfessorEditForm({ values: editValues });
  const reasonForm = useProfessorReasonForm({
    correctionReasonRequired: professor.correctionReasonRequired,
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

  function openStatusDialog(
    intent: "archive-professor" | "reactivate-professor",
  ) {
    reasonForm.form.reset({
      correctionReason: actionData?.values.correctionReason ?? "",
      statusIntent: intent,
    });
    setDialogIntent(intent);
  }

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      requireSelectedEvent={false}
      title="Detalle profesor"
      description="Revisá la información administrativa de este profesor."
      headerAction={
        loaderData.canEdit ? (
          <ProfessorActionsMenu
            active={professor.active}
            onSelect={openStatusDialog}
          />
        ) : null
      }
    >
      <section className="flex flex-col gap-6">
        <AlertStack>
          {!professor.active ? (
            <ArchivedPersonAlert
              personLabel="profesor"
              onReactivate={
                loaderData.canEdit
                  ? () => {
                      openStatusDialog("reactivate-professor");
                    }
                  : undefined
              }
            />
          ) : null}
          {professor.isIncomplete ? (
            <Alert variant="warning">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>
                Faltan datos de identificación.
              </AlertDescription>
            </Alert>
          ) : null}
        </AlertStack>

        <AdminResourceFormCard
          footer={
            <>
              {isEditing ? (
                <Button asChild variant="outline">
                  <Link to={loaderData.cancelHref}>Cancelar</Link>
                </Button>
              ) : (
                <Button asChild variant="outline">
                  <Link to={loaderData.backToList}>Volver</Link>
                </Button>
              )}
              {loaderData.canEdit ? (
                isEditing ? (
                  <Button type="submit" form="administracion-profesor-form">
                    <Check aria-hidden="true" data-icon="inline-start" />
                    Guardar
                  </Button>
                ) : (
                  <Button asChild>
                    <Link to={loaderData.editHref}>
                      <Pencil aria-hidden="true" data-icon="inline-start" />
                      Editar
                    </Link>
                  </Button>
                )
              ) : null}
            </>
          }
        >
          <form
            id="administracion-profesor-form"
            method="post"
            noValidate
            onSubmit={handleEditSubmit}
          >
            <input type="hidden" name="intent" value="update-professor" />
            <FieldGroup className="grid gap-5 md:grid-cols-2">
              <ReadOnlyField
                className="md:col-span-2"
                label="Academia"
                value={professor.academy.name}
              />
              {isEditing ? (
                <>
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
                </>
              ) : (
                <>
                  <ReadOnlyField label="Nombre" value={professor.firstName} />
                  <ReadOnlyField label="Apellido" value={professor.lastName} />
                  <ReadOnlyField
                    label="Tipo de documento"
                    value={formatProfessorDocumentType(professor.documentType)}
                  />
                  <ReadOnlyField
                    label="Número de documento"
                    value={professor.documentNumber ?? ""}
                  />
                </>
              )}
            </FieldGroup>
          </form>
        </AdminResourceFormCard>
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
