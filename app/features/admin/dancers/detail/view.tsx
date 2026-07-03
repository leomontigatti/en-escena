import { Check, Pencil, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import {
  AdminEmptyState,
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { ArchivedPersonAlert } from "@/components/shared/archived-person-alert";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { useServerActionToast } from "@/lib/shared/toasts";

import { DancerConfirmationDialog } from "./confirmation-dialog";
import {
  DancerBirthDateField,
  DancerDocumentTypeField,
  DancerTextField,
  ReadOnlyDateField,
  ReadOnlyDocumentImageField,
  ReadOnlyField,
  useDancerEditForm,
  useDancerStatusForm,
} from "./form";
import {
  formatDancerDocumentType,
  getDancerEditValues,
  getDancerStatusAction,
  getDancerStatusValues,
  getIdentificationAlert,
  getInitialDialogIntent,
  getSubmittedDancerUpdateValues,
  hasDancerVerificationMinimumData,
  type DancerActionError,
  type DancerDetailLoaderData,
  type DancerDialogIntent,
} from "./shared";

type AdministracionBailarinDetalleRouteViewProps = {
  actionData?: DancerActionError;
  loaderData: DancerDetailLoaderData;
};

export type InscriptionsSectionProps = {
  inscriptions: DancerDetailLoaderData["dancer"]["inscriptions"];
  selectedEventId: string | null;
};

const moneyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function AdministracionBailarinDetalleRouteView({
  actionData,
  loaderData,
}: AdministracionBailarinDetalleRouteViewProps) {
  useServerActionToast(actionData, {
    toastId: "admin-dancer-detail:error",
  });

  const dancer = loaderData.dancer;
  const isEditing =
    loaderData.canEdit && (loaderData.isEditing || Boolean(actionData));
  const submittedEditValues = getSubmittedDancerUpdateValues(actionData);
  const editForm = useDancerEditForm({
    correctionReasonRequired: dancer.correctionReasonRequired,
    values: getDancerEditValues({ actionData, dancer }),
  });
  const statusForm = useDancerStatusForm({
    correctionReasonRequired: dancer.correctionReasonRequired,
    values: getDancerStatusValues(actionData),
  });
  const statusAction = getDancerStatusAction(dancer.active);
  const canVerifyIdentity =
    loaderData.canEdit &&
    hasDancerVerificationMinimumData(dancer) &&
    dancer.identificationStatus !== "verified";
  const identificationAlert = getIdentificationAlert(
    dancer.identificationStatus,
  );
  const identificationAlertVariant =
    dancer.identificationStatus === "unverified" ? "info" : "warning";
  const [dialogIntent, setDialogIntent] = useState<DancerDialogIntent | null>(
    getInitialDialogIntent({
      actionData,
      correctionReasonRequired: dancer.correctionReasonRequired,
      statusIntent: statusAction.intent,
    }),
  );
  const editFormId = "admin-dancer-edit-form";
  const statusFormId = "admin-dancer-status-form";
  const verifyFormId = "admin-dancer-verify-form";
  const watchedBirthDate = editForm.form.watch("birthDate");
  const birthDateMayNeedRecalculation =
    isEditing &&
    dancer.participatedInAnyEvent &&
    watchedBirthDate !== dancer.birthDate;
  const shouldConfirmSave =
    dancer.correctionReasonRequired || birthDateMayNeedRecalculation;

  useEffect(() => {
    const nextIntent = getInitialDialogIntent({
      actionData,
      correctionReasonRequired: dancer.correctionReasonRequired,
      statusIntent: statusAction.intent,
    });

    if (!nextIntent) {
      return;
    }

    setDialogIntent(nextIntent);
  }, [
    actionData,
    dancer.correctionReasonRequired,
    statusAction.intent,
    submittedEditValues,
  ]);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Detalle bailarín"
      description="Consultá y corregí la información administrativa de este bailarín."
      requireSelectedEvent={false}
      headerAction={
        loaderData.canEdit ? (
          <ResourceActionsMenu>
            {canVerifyIdentity ? (
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setDialogIntent("verify");
                }}
              >
                Verificar
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              variant={
                statusAction.intent === "archive-dancer"
                  ? "destructive"
                  : "default"
              }
              onSelect={(event) => {
                event.preventDefault();
                setDialogIntent(statusAction.intent);
              }}
            >
              {statusAction.label}
            </DropdownMenuItem>
          </ResourceActionsMenu>
        ) : null
      }
    >
      <section className="flex flex-col gap-6">
        <AlertStack>
          {!dancer.active ? (
            <ArchivedPersonAlert
              personLabel="bailarín"
              onReactivate={
                loaderData.canEdit
                  ? () => {
                      setDialogIntent("reactivate-dancer");
                    }
                  : undefined
              }
            />
          ) : null}
          {identificationAlert ? (
            <DancerAlert
              variant={identificationAlertVariant}
              action={
                canVerifyIdentity
                  ? {
                      label: "Verificar",
                      onClick: () => {
                        setDialogIntent("verify");
                      },
                    }
                  : undefined
              }
            >
              {identificationAlert}
            </DancerAlert>
          ) : null}
        </AlertStack>

        <AdminResourceFormCard
          footer={
            <DancerDetailFooterActions
              backToList={loaderData.backToList}
              canEdit={loaderData.canEdit}
              cancelHref={loaderData.cancelHref}
              editFormId={editFormId}
              editHref={loaderData.editHref}
              isEditing={isEditing}
              onConfirmSave={() => {
                setDialogIntent("save");
              }}
              shouldConfirmSave={shouldConfirmSave}
            />
          }
        >
          <form
            id={editFormId}
            method="post"
            noValidate
            onSubmit={editForm.handleSubmit}
            className="flex flex-col gap-6"
          >
            <input type="hidden" name="intent" value="update-dancer" />
            <FieldGroup className="grid gap-5 md:grid-cols-2">
              <ReadOnlyField
                className="md:col-span-2"
                label="Academia"
                value={dancer.academy.name}
              />
              {isEditing ? (
                <>
                  <DancerTextField
                    form={editForm.form}
                    label="Nombre"
                    name="firstName"
                  />
                  <DancerTextField
                    form={editForm.form}
                    label="Apellido"
                    name="lastName"
                  />
                </>
              ) : (
                <>
                  <ReadOnlyField label="Nombre" value={dancer.firstName} />
                  <ReadOnlyField label="Apellido" value={dancer.lastName} />
                </>
              )}
            </FieldGroup>

            <Tabs defaultValue="identificacion">
              <TabsList variant="line">
                <TabsTrigger value="identificacion">Identificación</TabsTrigger>
                <TabsTrigger value="inscripciones">Inscripciones</TabsTrigger>
              </TabsList>
              <TabsContent value="identificacion" className="pt-2">
                <FieldGroup className="grid gap-5 md:grid-cols-2">
                  {isEditing ? (
                    <>
                      <DancerBirthDateField form={editForm.form} />
                      <div aria-hidden="true" className="hidden md:block" />
                      <DancerDocumentTypeField form={editForm.form} />
                      <DancerTextField
                        form={editForm.form}
                        label="Número de documento"
                        name="documentNumber"
                      />
                      <ReadOnlyDocumentImageField
                        label="Imagen frente del documento"
                        name="documentFrontImageStorageKey"
                        storageKey={dancer.documentFrontImageStorageKey}
                        url={loaderData.documentImageUrls.front}
                      />
                      <ReadOnlyDocumentImageField
                        label="Imagen dorso del documento"
                        name="documentBackImageStorageKey"
                        storageKey={dancer.documentBackImageStorageKey}
                        url={loaderData.documentImageUrls.back}
                      />
                    </>
                  ) : (
                    <>
                      <ReadOnlyDateField value={dancer.birthDate} />
                      <div aria-hidden="true" className="hidden md:block" />
                      <ReadOnlyField
                        label="Tipo de documento"
                        value={formatDancerDocumentType(dancer.documentType)}
                      />
                      <ReadOnlyField
                        label="Número de documento"
                        value={dancer.documentNumber ?? ""}
                      />
                      <ReadOnlyDocumentImageField
                        label="Imagen frente del documento"
                        storageKey={dancer.documentFrontImageStorageKey}
                        url={loaderData.documentImageUrls.front}
                      />
                      <ReadOnlyDocumentImageField
                        label="Imagen dorso del documento"
                        storageKey={dancer.documentBackImageStorageKey}
                        url={loaderData.documentImageUrls.back}
                      />
                    </>
                  )}
                </FieldGroup>
              </TabsContent>
              <TabsContent value="inscripciones" className="pt-2">
                <InscriptionsSection
                  inscriptions={dancer.inscriptions}
                  selectedEventId={loaderData.selectedEventId}
                />
              </TabsContent>
            </Tabs>
          </form>
        </AdminResourceFormCard>

        <DancerConfirmationDialog
          birthDateMayNeedRecalculation={birthDateMayNeedRecalculation}
          correctionReasonRequired={dancer.correctionReasonRequired}
          dialogIntent={dialogIntent}
          editForm={editForm}
          editFormId={editFormId}
          onOpenChange={(open) => {
            if (!open) {
              setDialogIntent(null);
            }
          }}
          statusAction={statusAction}
          statusForm={statusForm}
          statusFormId={statusFormId}
          verifyFormId={verifyFormId}
        />
      </section>
    </AdminResourceLayout>
  );
}

function DancerDetailFooterActions({
  backToList,
  canEdit,
  cancelHref,
  editFormId,
  editHref,
  isEditing,
  onConfirmSave,
  shouldConfirmSave,
}: {
  backToList: string;
  canEdit: boolean;
  cancelHref: string;
  editFormId: string;
  editHref: string;
  isEditing: boolean;
  onConfirmSave: () => void;
  shouldConfirmSave: boolean;
}) {
  return (
    <>
      <Button asChild variant="outline">
        <Link to={isEditing ? cancelHref : backToList}>
          {isEditing ? "Cancelar" : "Volver"}
        </Link>
      </Button>
      <DancerPrimaryFooterAction
        canEdit={canEdit}
        editFormId={editFormId}
        editHref={editHref}
        isEditing={isEditing}
        onConfirmSave={onConfirmSave}
        shouldConfirmSave={shouldConfirmSave}
      />
    </>
  );
}

function DancerPrimaryFooterAction({
  canEdit,
  editFormId,
  editHref,
  isEditing,
  onConfirmSave,
  shouldConfirmSave,
}: {
  canEdit: boolean;
  editFormId: string;
  editHref: string;
  isEditing: boolean;
  onConfirmSave: () => void;
  shouldConfirmSave: boolean;
}) {
  if (!canEdit) {
    return null;
  }

  if (!isEditing) {
    return (
      <Button asChild>
        <Link to={editHref}>
          <Pencil aria-hidden="true" data-icon="inline-start" />
          Editar
        </Link>
      </Button>
    );
  }

  if (shouldConfirmSave) {
    return (
      <Button type="button" onClick={onConfirmSave}>
        <Check aria-hidden="true" data-icon="inline-start" />
        Guardar
      </Button>
    );
  }

  return (
    <Button type="submit" form={editFormId}>
      <Check aria-hidden="true" data-icon="inline-start" />
      Guardar
    </Button>
  );
}

function DancerAlert({
  action,
  children,
  variant = "warning",
}: {
  action?: {
    label: string;
    onClick: () => void;
  };
  children: ReactNode;
  variant?: "destructive" | "info" | "warning";
}) {
  return (
    <Alert variant={variant}>
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
      {action ? (
        <AlertAction className="top-1/2 -translate-y-1/2">
          <Button type="button" variant="link" onClick={action.onClick}>
            {action.label}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

export function InscriptionsSection({
  inscriptions,
  selectedEventId,
}: InscriptionsSectionProps) {
  if (!selectedEventId) {
    return (
      <AdminEmptyState
        title="Sin evento activo"
        description="No hay un evento activo seleccionado para revisar inscripciones."
      />
    );
  }

  if (inscriptions.length === 0) {
    return (
      <AdminEmptyState
        title="Sin inscripciones en el evento activo"
        description="Este bailarín no tiene inscripciones en el evento activo."
      />
    );
  }

  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="px-3">Nombre coreografía</TableHead>
            <TableHead className="px-3">Tipo de grupo</TableHead>
            <TableHead className="px-3">Precio base</TableHead>
            <TableHead className="px-3">Descuento</TableHead>
            <TableHead className="px-3">Subtotal estimado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inscriptions.map((inscription) => (
            <TableRow key={inscription.id}>
              <TableCell className="px-3">
                {inscription.choreographyName}
              </TableCell>
              <TableCell className="px-3 text-muted-foreground">
                {formatGroupTypeLabel(inscription.groupType)}
              </TableCell>
              <TableCell className="px-3">
                {formatMoney(inscription.basePriceAmount)}
              </TableCell>
              <TableCell className="px-3">
                {formatMoney(inscription.discountAmount)}
              </TableCell>
              <TableCell className="px-3">
                {formatMoney(inscription.estimatedSubtotalAmount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatMoney(amount: number | null) {
  if (amount === null) {
    return "Sin precio";
  }

  return moneyFormatter.format(amount);
}
