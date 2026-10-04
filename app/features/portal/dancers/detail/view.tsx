import { Archive, Info, RotateCcw, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Form, useNavigation, useSubmit } from "react-router";

import { PortalEmptyState, PortalPageHeader } from "@/components/portal/ui";
import { FormActions } from "@/components/shared/form-actions";
import { RosterNameWarningDialog } from "@/components/shared/roster-name-warning";
import { AlertStack } from "@/components/shared/alert-stack";
import { RecategorisedChoreographiesAlert } from "@/components/shared/recategorised-choreographies-alert";
import type { RecategorisedChoreography } from "@/lib/choreographies/recategorisation-report";
import { ArchivedPersonAlert } from "@/components/shared/archived-person-alert";
import { useRosterDocumentConflictField } from "@/components/shared/roster-document-conflict";
import {
  documentTypeEmptyLabel,
  documentTypeOptions,
} from "@/components/shared/document-type-options";
import { DancerInscriptionsTable } from "@/components/shared/roster-inscriptions-table";
import { RosterSeminarInscriptionsTable } from "@/components/shared/roster-seminar-inscriptions-table";
import { useResetListQuery } from "@/components/shared/data-table-url-state";
import { ReadOnlyDocumentImageField } from "@/components/shared/read-only-document-image-field";
import {
  ReadOnlyDateField,
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { RosterPersonArchiveBlockedDialog } from "@/components/shared/roster-person-archive-blocked-dialog";
import { SelectField } from "@/components/shared/select-field";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { portalSeminarDetailPath } from "@/features/portal/seminars/shared";
import {
  formatDancerIdentificationPendingItemLabel,
  getDancerIdentificationPendingItems,
  getDancerVerificationStatus,
  type DancerIdentificationPendingItem,
} from "@/lib/dancers/verification";
import {
  isRouteFormPending,
  useCloseOnceSettled,
  useLatestActionData,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";
import { useRecordTitleDetailTransitionStyle } from "@/lib/shared/view-transitions";

import {
  PortalDancerBirthDateField,
  PortalDancerDocumentImageFields,
  PortalDancerTextField,
  usePortalDancerForm,
} from "./form";
import {
  buildPortalDancerDetailViewModel,
  getGeneralActionError,
  getPortalDancerDocumentConflict,
  getPortalDancerFormValues,
  getPortalDancerStatusFormId,
  portalDancerFormId,
  portalDancerStatusActions,
  type PortalDancerDetailActionData,
  type PortalDancerDetailLoaderData,
  type PortalDancerStatusIntent,
} from "./shared";

export type PortalDancerDetailRouteViewProps = {
  loaderData: PortalDancerDetailLoaderData;
  actionData?: PortalDancerDetailActionData;
  initialStatusDialogIntent?: PortalDancerStatusIntent | null;
};

export function PortalDancerDetailRouteView({
  loaderData,
  actionData,
  initialStatusDialogIntent = null,
}: PortalDancerDetailRouteViewProps) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const resetListQuery = useResetListQuery();
  // The refused values outlive a search in the other tabs' lists.
  const latestActionData = useLatestActionData(
    actionData,
    loaderData.dancer.id,
  );
  const formValues = getPortalDancerFormValues({
    actionData: latestActionData,
    dancer: loaderData.dancer,
  });
  const form = usePortalDancerForm({
    eventStartDate: loaderData.activeEventStartDate,
    savedValues: getPortalDancerFormValues({ dancer: loaderData.dancer }),
    submit,
    values: formValues,
  });
  const nameWarning = actionData?.status === "warning" ? actionData : undefined;
  const documentConflictDescription = useRosterDocumentConflictField({
    actionData,
    conflict: getPortalDancerDocumentConflict(actionData),
    name: "documentNumber",
    setError: form.form.setError,
  });
  const [statusDialogIntent, setStatusDialogIntent] =
    useState<PortalDancerStatusIntent | null>(initialStatusDialogIntent);
  const verificationStatus = getDancerVerificationStatus(loaderData.dancer);
  const identificationPendingItems = getDancerIdentificationPendingItems(
    loaderData.dancer,
  );
  const viewModel = buildPortalDancerDetailViewModel({
    dancer: loaderData.dancer,
    formValues,
    identificationPendingItems,
    isParticipatingInActiveEvent: loaderData.isParticipatingInActiveEvent,
    verificationStatus,
  });
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "update-dancer";
  const viewTransitionStyle = useRecordTitleDetailTransitionStyle({
    detailHref: viewModel.detailHref,
    listHref: "/portal/bailarines",
  });

  const successData = actionData?.status === "success" ? actionData : undefined;

  useServerActionToast(getGeneralActionError(actionData), {
    toastId: "portal-bailarin-detail:error",
  });
  useServerActionToast(successData, {
    toastId: "portal-bailarin-detail:success",
  });

  return (
    <>
      <section
        className="flex flex-1 flex-col gap-6"
        aria-labelledby="bailarin-detail-title"
      >
        <PortalPageHeader
          titleId="bailarin-detail-title"
          title={viewModel.title}
          titleStyle={viewTransitionStyle}
          description="Actualizá los datos de este bailarín."
          action={
            <ResourceActionsMenu contentClassName="w-40">
              <DropdownMenuItem
                variant={viewModel.statusAction.confirmButtonVariant}
                onSelect={() =>
                  setStatusDialogIntent(viewModel.statusAction.intent)
                }
              >
                {viewModel.statusAction.label}
              </DropdownMenuItem>
            </ResourceActionsMenu>
          }
        />

        <PortalDancerAlertsSection
          dancerActive={loaderData.dancer.active}
          identificationPendingItems={viewModel.identificationPendingItems}
          onReactivate={() => {
            setStatusDialogIntent("reactivate-dancer");
          }}
          showsIdentificationAlert={viewModel.showsIdentificationAlert}
          showsPendingVerificationAlert={
            viewModel.showsPendingVerificationAlert
          }
          recategorisedChoreographies={
            successData?.recategorisedChoreographies ?? []
          }
          showsVerifiedIdentityAlert={viewModel.showsVerifiedIdentityAlert}
        />

        <Tabs defaultValue="identificacion" onValueChange={resetListQuery}>
          <TabsList variant="line">
            <TabsTrigger value="identificacion">Identificación</TabsTrigger>
            <TabsTrigger value="inscripciones">Inscripciones</TabsTrigger>
            <TabsTrigger value="seminarios">Seminarios</TabsTrigger>
          </TabsList>
          {/* Kept mounted behind the other tab, so a file picked here is
              still in its input after a look at the inscriptions and the
              leave guard in `Guardar`'s footer still covers the draft. */}
          <TabsContent
            forceMount
            value="identificacion"
            className="pt-2 data-[state=inactive]:hidden"
          >
            <PortalDancerFormSection
              footer={
                <FormActions
                  backTo="/portal/bailarines"
                  form={portalDancerFormId}
                  hasChanges={form.form.formState.isDirty}
                  isPending={isSubmitting}
                  onDiscard={form.discard}
                  viewTransition
                />
              }
            >
              <CardContent>
                <form
                  id={portalDancerFormId}
                  method="post"
                  encType="multipart/form-data"
                  noValidate
                  onSubmit={form.handleSubmit}
                  className="flex flex-col gap-6"
                >
                  <input type="hidden" name="intent" value="update-dancer" />
                  <PortalDancerIdentificationFields
                    documentConflictDescription={documentConflictDescription}
                    documentImageUrls={loaderData.documentImageUrls}
                    form={form}
                    viewModel={viewModel}
                  />
                </form>
              </CardContent>
            </PortalDancerFormSection>
          </TabsContent>
          <TabsContent value="inscripciones" className="pt-2">
            <PortalDancerInscriptionsSection
              inscriptions={loaderData.inscriptions}
              selectedEventId={loaderData.selectedEventId}
            />
          </TabsContent>
          <TabsContent value="seminarios" className="pt-2">
            <PortalDancerSeminarInscriptionsSection
              inscriptions={loaderData.seminarInscriptions}
              selectedEventId={loaderData.selectedEventId}
            />
          </TabsContent>
        </Tabs>
        {nameWarning ? (
          <RosterNameWarningDialog
            formId={portalDancerFormId}
            isPending={isSubmitting}
            warning={nameWarning.warning}
          />
        ) : null}
      </section>

      <PortalDancerStatusDialogs
        intent={statusDialogIntent}
        isArchiveBlocked={viewModel.statusAction.isBlocked}
        onClose={() => setStatusDialogIntent(null)}
      />
    </>
  );
}

/**
 * The identification panel: every field flips to read-only once the identity
 * is verified, which is why the whole group lives apart from the route view.
 */
function PortalDancerIdentificationFields({
  documentConflictDescription,
  documentImageUrls,
  form,
  viewModel,
}: {
  documentConflictDescription: ReactNode;
  documentImageUrls: PortalDancerDetailLoaderData["documentImageUrls"];
  form: ReturnType<typeof usePortalDancerForm>;
  viewModel: ReturnType<typeof buildPortalDancerDetailViewModel>;
}) {
  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      {viewModel.isIdentityVerified ? (
        <>
          <ReadOnlyField
            label="Nombre"
            name="firstName"
            value={viewModel.identityFieldValues.firstName}
          />
          <ReadOnlyField
            label="Apellido"
            name="lastName"
            value={viewModel.identityFieldValues.lastName}
          />
        </>
      ) : (
        <>
          <PortalDancerTextField
            form={form.form}
            label="Nombre"
            name="firstName"
          />
          <PortalDancerTextField
            form={form.form}
            label="Apellido"
            name="lastName"
          />
        </>
      )}
      {viewModel.isIdentityVerified ? (
        <ReadOnlyDateField
          label="Fecha de nacimiento"
          name="birthDate"
          value={viewModel.identityFieldValues.birthDate}
        />
      ) : (
        <PortalDancerBirthDateField form={form.form} />
      )}
      <div className="hidden md:block" aria-hidden="true" />
      {viewModel.isIdentityVerified ? (
        <ReadOnlySelectField
          label="Tipo de documento"
          name="documentType"
          options={documentTypeOptions}
          value={viewModel.identityFieldValues.documentType}
        />
      ) : (
        <SelectField
          allowEmpty
          control={form.form.control}
          emptyLabel={documentTypeEmptyLabel}
          label="Tipo de documento"
          name="documentType"
          options={documentTypeOptions}
          placeholder={documentTypeEmptyLabel}
        />
      )}
      {viewModel.isIdentityVerified ? (
        <ReadOnlyField
          label="Número de documento"
          name="documentNumber"
          value={viewModel.identityFieldValues.documentNumber}
        />
      ) : (
        <PortalDancerTextField
          description={documentConflictDescription}
          form={form.form}
          label="Número de documento"
          name="documentNumber"
        />
      )}
      {viewModel.isIdentityVerified ? (
        <>
          <ReadOnlyDocumentImageField
            label="Imagen frente del documento"
            name="documentFrontImageStorageKey"
            storageKey={
              viewModel.identityFieldValues.documentFrontImageStorageKey
            }
            url={documentImageUrls.front}
          />
          <ReadOnlyDocumentImageField
            label="Imagen dorso del documento"
            name="documentBackImageStorageKey"
            storageKey={
              viewModel.identityFieldValues.documentBackImageStorageKey
            }
            url={documentImageUrls.back}
          />
        </>
      ) : (
        <PortalDancerDocumentImageFields
          form={form.form}
          imageUrls={documentImageUrls}
        />
      )}
    </FieldGroup>
  );
}

function PortalDancerAlertsSection({
  dancerActive,
  identificationPendingItems,
  onReactivate,
  recategorisedChoreographies,
  showsIdentificationAlert,
  showsPendingVerificationAlert,
  showsVerifiedIdentityAlert,
}: {
  dancerActive: boolean;
  identificationPendingItems: DancerIdentificationPendingItem[];
  onReactivate: () => void;
  recategorisedChoreographies: RecategorisedChoreography[];
  showsIdentificationAlert: boolean;
  showsPendingVerificationAlert: boolean;
  showsVerifiedIdentityAlert: boolean;
}) {
  return (
    <section
      aria-labelledby="bailarin-detail-alerts-title"
      className="flex flex-col gap-6"
    >
      <h2 id="bailarin-detail-alerts-title" className="sr-only">
        Alertas de la ficha del bailarín
      </h2>
      <AlertStack>
        {recategorisedChoreographies.length > 0 ? (
          <RecategorisedChoreographiesAlert
            buildChoreographyHref={(choreographyId) =>
              `/portal/coreografias/${choreographyId}`
            }
            choreographies={recategorisedChoreographies}
            surface="portal"
          />
        ) : null}
        {!dancerActive ? (
          <ArchivedPersonAlert
            personLabel="bailarín"
            onReactivate={onReactivate}
          />
        ) : null}
        {showsIdentificationAlert ? (
          <Alert variant="warning">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Faltan datos de identificación</AlertTitle>
            <AlertDescription>
              {formatIdentificationPendingAlert(identificationPendingItems)}
            </AlertDescription>
          </Alert>
        ) : null}
        {showsPendingVerificationAlert ? (
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertTitle>Identidad sin verificar</AlertTitle>
            <AlertDescription>
              La identidad del bailarín está sin verificar.
            </AlertDescription>
          </Alert>
        ) : null}
        {showsVerifiedIdentityAlert ? (
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertTitle>Identidad verificada</AlertTitle>
            <AlertDescription>
              La identidad del bailarín está verificada. Comunicate con nosotros
              si necesitás realizar algún cambio.
            </AlertDescription>
          </Alert>
        ) : null}
      </AlertStack>
    </section>
  );
}

function PortalDancerInscriptionsSection({
  inscriptions,
  selectedEventId,
}: {
  inscriptions: PortalDancerDetailLoaderData["inscriptions"];
  selectedEventId: PortalDancerDetailLoaderData["selectedEventId"];
}) {
  if (!selectedEventId) {
    return (
      <PortalEmptyState
        title="Sin evento activo"
        description="No hay un evento activo para revisar inscripciones."
      />
    );
  }

  return (
    <DancerInscriptionsTable
      buildChoreographyHref={(choreographyId) =>
        `/portal/coreografias/${choreographyId}`
      }
      inscriptions={inscriptions}
    />
  );
}

function PortalDancerSeminarInscriptionsSection({
  inscriptions,
  selectedEventId,
}: {
  inscriptions: PortalDancerDetailLoaderData["seminarInscriptions"];
  selectedEventId: PortalDancerDetailLoaderData["selectedEventId"];
}) {
  if (!selectedEventId) {
    return (
      <PortalEmptyState
        title="Sin evento activo"
        description="No hay un evento activo para revisar seminarios."
      />
    );
  }

  return (
    <RosterSeminarInscriptionsTable
      buildSeminarHref={portalSeminarDetailPath}
      inscriptions={inscriptions}
      personKind="dancer"
    />
  );
}

function PortalDancerFormSection({
  children,
  footer,
}: {
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <section
      aria-labelledby="bailarin-detail-form-title"
      className="flex flex-col"
    >
      <h2 id="bailarin-detail-form-title" className="sr-only">
        Ficha del bailarín
      </h2>
      <Card className="overflow-clip">
        {children}
        {footer}
      </Card>
    </section>
  );
}

function PortalDancerStatusDialog({
  intent,
  onOpenChange,
}: {
  intent: PortalDancerStatusIntent | null;
  onOpenChange: (open: boolean) => void;
}) {
  const action = intent ? portalDancerStatusActions[intent] : null;
  const isOpen = action !== null;
  const dialogFormId = getPortalDancerStatusFormId(intent);
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
                    <PortalDancerStatusActionIcon intent={action.intent} />
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

function formatIdentificationPendingAlert(
  pendingItems: DancerIdentificationPendingItem[],
) {
  return `${
    pendingItems.length === 1 ? "Falta" : "Faltan"
  } completar ${formatIdentificationPendingItems(
    pendingItems,
  )} para poder verificar la identidad del bailarín.`;
}

function formatIdentificationPendingItems(
  pendingItems: DancerIdentificationPendingItem[],
) {
  return formatList(
    pendingItems.map(formatDancerIdentificationPendingItemLabel),
  );
}

function formatList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

function PortalDancerStatusActionIcon({
  intent,
}: {
  intent: PortalDancerStatusIntent;
}) {
  if (intent === "archive-dancer") {
    return <Archive aria-hidden="true" data-icon="inline-start" />;
  }

  return <RotateCcw aria-hidden="true" data-icon="inline-start" />;
}

/**
 * `Archivar` opens the blocked acknowledgment instead of its confirmation
 * while the dancer takes part in the active event; every other intent opens
 * the confirmation.
 */
function PortalDancerStatusDialogs({
  intent,
  isArchiveBlocked,
  onClose,
}: {
  intent: PortalDancerStatusIntent | null;
  isArchiveBlocked: boolean;
  onClose: () => void;
}) {
  const isBlockedOpen = intent === "archive-dancer" && isArchiveBlocked;
  const closeOnDismiss = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <>
      <RosterPersonArchiveBlockedDialog
        kind="dancer"
        onOpenChange={closeOnDismiss}
        open={isBlockedOpen}
      />
      <PortalDancerStatusDialog
        intent={isBlockedOpen ? null : intent}
        onOpenChange={closeOnDismiss}
      />
    </>
  );
}
