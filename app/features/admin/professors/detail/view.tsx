import { Check, CircleAlert, Pencil, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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
  getProfessorEditFieldErrors,
  getProfessorEditValues,
  getProfessorReasonFieldErrors,
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
      selectedEventId={loaderData.selectedEventId}
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
        <div className="flex flex-col gap-3">
          {!professor.active ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>
                Este profesor está archivado. Reactivalo para que vuelva a
                aparecer en las vistas activas y en próximas selecciones del
                portal.
              </AlertDescription>
              {loaderData.canEdit ? (
                <AlertAction className="top-1/2 -translate-y-1/2">
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
            <Alert variant="warning">
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
                    <ReadOnlyField
                      label="Apellido"
                      value={professor.lastName}
                    />
                    <ReadOnlyField
                      label="Tipo de documento"
                      value={formatProfessorDocumentType(
                        professor.documentType,
                      )}
                    />
                    <ReadOnlyField
                      label="Número de documento"
                      value={professor.documentNumber ?? ""}
                    />
                  </>
                )}
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
            {isEditing ? (
              <Button asChild variant="outline" size="lg">
                <Link to={loaderData.cancelHref}>Cancelar</Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="lg">
                <Link to={loaderData.backToList}>Volver</Link>
              </Button>
            )}
            {loaderData.canEdit ? (
              isEditing ? (
                <Button
                  type="submit"
                  form="administracion-profesor-form"
                  size="lg"
                >
                  <Check aria-hidden="true" data-icon="inline-start" />
                  Guardar
                </Button>
              ) : (
                <Button asChild size="lg">
                  <Link to={loaderData.editHref}>
                    <Pencil aria-hidden="true" data-icon="inline-start" />
                    Editar
                  </Link>
                </Button>
              )
            ) : null}
          </CardFooter>
        </Card>
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
