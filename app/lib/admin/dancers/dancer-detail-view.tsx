import { Check, CircleAlert, Pencil, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { useServerActionToast } from "@/lib/shared/toasts";

import { DancerConfirmationDialog } from "./dancer-detail-confirmation-dialog";
import {
  DancerBirthDateField,
  DancerDocumentTypeField,
  DancerTextField,
  ReadOnlyDateField,
  ReadOnlyDocumentImageField,
  ReadOnlyField,
  useDancerEditForm,
  useDancerStatusForm,
} from "./dancer-detail-form";
import {
  formatDancerDocumentType,
  getDancerEditFieldErrors,
  getDancerEditValues,
  getDancerStatusAction,
  getDancerStatusFieldErrors,
  getDancerStatusValues,
  getIdentificationAlert,
  getInitialDialogIntent,
  getSubmittedDancerUpdateValues,
  hasDancerVerificationMinimumData,
  type DancerActionError,
  type DancerDetailLoaderData,
  type DancerDialogIntent,
} from "./dancer-detail.shared";

type AdministracionBailarinDetalleRouteViewProps = {
  actionData?: DancerActionError;
  loaderData: DancerDetailLoaderData;
};

export type InscriptionsSectionProps = {
  inscriptions: DancerDetailLoaderData["dancer"]["inscriptions"];
  selectedEventId: string | null;
};

type DancerInscription =
  DancerDetailLoaderData["dancer"]["inscriptions"][number];

const moneyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const inscriptionColumns: DataTableColumn<DancerInscription>[] = [
  {
    id: "choreography",
    header: "Nombre coreografía",
    cell: (inscription) => inscription.choreographyName,
    filterValue: (inscription) => inscription.choreographyName,
  },
  {
    id: "groupType",
    header: "Tipo de grupo",
    cell: (inscription) => formatGroupTypeLabel(inscription.groupType),
    filterValue: (inscription) => formatGroupTypeLabel(inscription.groupType),
  },
  {
    id: "basePrice",
    header: "Precio base",
    cell: (inscription) => formatMoney(inscription.basePriceInCents),
  },
  {
    id: "discount",
    header: "Descuento",
    cell: (inscription) => formatMoney(inscription.discountInCents),
  },
  {
    id: "estimatedSubtotal",
    header: "Subtotal estimado",
    cell: (inscription) => formatMoney(inscription.estimatedSubtotalInCents),
  },
];

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
    fieldErrors: getDancerEditFieldErrors(
      actionData?.fieldErrors,
      submittedEditValues !== null,
    ),
    values: getDancerEditValues({ actionData, dancer }),
  });
  const statusForm = useDancerStatusForm({
    correctionReasonRequired: dancer.correctionReasonRequired,
    fieldErrors: getDancerStatusFieldErrors(
      actionData?.fieldErrors,
      submittedEditValues !== null,
    ),
    values: getDancerStatusValues(actionData),
  });
  const statusAction = getDancerStatusAction(dancer.active);
  const canVerifyIdentity =
    loaderData.canEdit &&
    hasDancerVerificationMinimumData(dancer) &&
    dancer.identificationStatus !== "verified";
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
        <DancerStatusAlerts
          active={dancer.active}
          canVerifyIdentity={canVerifyIdentity}
          identificationStatus={dancer.identificationStatus}
          onVerifyIdentity={() => {
            setDialogIntent("verify");
          }}
        />

        <Card>
          <CardContent>
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
                  <TabsTrigger value="identificacion">
                    Identificación
                  </TabsTrigger>
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
          </CardContent>
          <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
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
          </CardFooter>
        </Card>

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
      <Button asChild variant="outline" size="lg">
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
      <Button asChild size="lg">
        <Link to={editHref}>
          <Pencil aria-hidden="true" data-icon="inline-start" />
          Editar
        </Link>
      </Button>
    );
  }

  if (shouldConfirmSave) {
    return (
      <Button type="button" size="lg" onClick={onConfirmSave}>
        <Check aria-hidden="true" data-icon="inline-start" />
        Guardar
      </Button>
    );
  }

  return (
    <Button type="submit" form={editFormId} size="lg">
      <Check aria-hidden="true" data-icon="inline-start" />
      Guardar
    </Button>
  );
}

function DancerStatusAlerts({
  active,
  canVerifyIdentity,
  identificationStatus,
  onVerifyIdentity,
}: {
  active: boolean;
  canVerifyIdentity: boolean;
  identificationStatus: DancerDetailLoaderData["dancer"]["identificationStatus"];
  onVerifyIdentity: () => void;
}) {
  const identificationAlert = getIdentificationAlert(identificationStatus);
  const identificationAlertVariant =
    identificationStatus === "unverified" ? "info" : "warning";

  if (active && !identificationAlert) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {!active ? (
        <DancerAlert icon={CircleAlert} variant="destructive">
          Este bailarín está archivado.
        </DancerAlert>
      ) : null}
      {identificationAlert ? (
        <DancerAlert
          variant={identificationAlertVariant}
          action={
            canVerifyIdentity
              ? {
                  label: "Verificar",
                  onClick: onVerifyIdentity,
                }
              : undefined
          }
        >
          {identificationAlert}
        </DancerAlert>
      ) : null}
    </div>
  );
}

function DancerAlert({
  action,
  children,
  icon: Icon = TriangleAlert,
  variant = "warning",
}: {
  action?: {
    label: string;
    onClick: () => void;
  };
  children: ReactNode;
  icon?: typeof TriangleAlert;
  variant?: "destructive" | "info" | "warning";
}) {
  return (
    <Alert variant={variant}>
      <Icon aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
      {action ? (
        <AlertAction className="top-1/2 -translate-y-1/2">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={action.onClick}
          >
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
    <DataTable
      mode="client"
      rows={inscriptions}
      columns={inscriptionColumns}
      getRowKey={(inscription) => inscription.id}
      searchPlaceholder="Buscar coreografía"
      textFilterColumnId="choreography"
    />
  );
}

function formatMoney(valueInCents: number | null) {
  if (valueInCents === null) {
    return "Sin precio";
  }

  return moneyFormatter.format(valueInCents / 100);
}
