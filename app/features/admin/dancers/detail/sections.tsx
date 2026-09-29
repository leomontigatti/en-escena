import { RosterNameWarningNotice } from "@/components/shared/roster-name-warning";
import type { RosterNameWarning } from "@/lib/roster/roster-name-duplicates";
import type { SubmitEventHandler, ReactNode } from "react";

import {
  AdminEmptyState,
  AdminResourceFormCard,
} from "@/components/admin/resource-layout";
import { alertVariantIcons } from "@/components/shared/alert-icons";
import { AlertStack } from "@/components/shared/alert-stack";
import { RecategorisedChoreographiesAlert } from "@/components/shared/recategorised-choreographies-alert";
import type { RecategorisedChoreography } from "@/lib/choreographies/recategorisation-report";
import { FormActions } from "@/components/shared/form-actions";
import { ArchivedPersonAlert } from "@/components/shared/archived-person-alert";
import { DancerInscriptionsTable } from "@/components/shared/dancer-inscriptions-table";
import {
  documentTypeEmptyLabel,
  documentTypeOptions,
} from "@/components/shared/document-type-options";
import { ReadOnlyDocumentImageField } from "@/components/shared/read-only-document-image-field";
import {
  ReadOnlyDateField,
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { RosterPersonParticipatingAlert } from "@/components/shared/roster-person-participating-alert";
import { SelectField } from "@/components/shared/select-field";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  DancerBirthDateField,
  DancerTextField,
  type DancerEditFormController,
} from "./form";
import { choreographyDetailPath } from "@/lib/choreographies/admin-paths";

import {
  type DancerDetailLoaderData,
  type DancerDialogIntent,
  type DancerStatusAction,
} from "./shared";

export type InscriptionsSectionProps = {
  /** The dancer's academy, which each choreography's admin address is under. */
  academyId: string;
  inscriptions: DancerDetailLoaderData["dancer"]["inscriptions"];
  selectedEventId: string | null;
};

export function DancerDetailHeaderActions({
  canEdit,
  canVerifyIdentity,
  onSelectIntent,
  onSelectMerge,
  statusAction,
}: {
  canEdit: boolean;
  canVerifyIdentity: boolean;
  onSelectIntent: (intent: DancerDialogIntent) => void;
  onSelectMerge: () => void;
  statusAction: DancerStatusAction;
}) {
  if (!canEdit) {
    return null;
  }

  return (
    <ResourceActionsMenu>
      {canVerifyIdentity ? (
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onSelectIntent("verify");
          }}
        >
          Verificar
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem
        disabled={statusAction.disabled}
        variant={
          statusAction.intent === "archive-dancer" ? "destructive" : "default"
        }
        onSelect={(event) => {
          event.preventDefault();
          onSelectIntent(statusAction.intent);
        }}
      >
        {statusAction.label}
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        onSelect={(event) => {
          event.preventDefault();
          onSelectMerge();
        }}
      >
        Fusionar
      </DropdownMenuItem>
    </ResourceActionsMenu>
  );
}

export function DancerDetailAlerts({
  academyId,
  active,
  canEdit,
  canVerifyIdentity,
  identificationAlert,
  identificationAlertTitle,
  identificationAlertVariant,
  nameWarning,
  nameWarningFormId,
  onSelectIntent,
  participatingAlert,
  recategorisedChoreographies,
}: {
  /** The dancer's academy, which each choreography's admin address is under. */
  academyId: string;
  active: boolean;
  canEdit: boolean;
  canVerifyIdentity: boolean;
  identificationAlert: string | null;
  identificationAlertTitle: string;
  identificationAlertVariant: "info" | "warning";
  /** The same-name warning of the last save, answered through the edit form. */
  nameWarning?: RosterNameWarning;
  nameWarningFormId: string;
  onSelectIntent: (intent: DancerDialogIntent) => void;
  participatingAlert: string | null;
  recategorisedChoreographies: RecategorisedChoreography[];
}) {
  const onReactivate = canEdit
    ? () => onSelectIntent("reactivate-dancer")
    : undefined;
  const verifyAction = canVerifyIdentity
    ? { label: "Verificar", onClick: () => onSelectIntent("verify") }
    : undefined;

  return (
    <AlertStack>
      {nameWarning ? (
        <RosterNameWarningNotice
          formId={nameWarningFormId}
          warning={nameWarning}
        />
      ) : null}
      {recategorisedChoreographies.length > 0 ? (
        <RecategorisedChoreographiesAlert
          buildChoreographyHref={(choreographyId) =>
            choreographyDetailPath({ academyId, choreographyId })
          }
          choreographies={recategorisedChoreographies}
          surface="admin"
        />
      ) : null}
      {!active ? (
        <ArchivedPersonAlert
          personLabel="bailarín"
          onReactivate={onReactivate}
        />
      ) : null}
      {participatingAlert ? (
        <RosterPersonParticipatingAlert message={participatingAlert} />
      ) : null}
      {identificationAlert ? (
        <DancerAlert
          action={verifyAction}
          title={identificationAlertTitle}
          variant={identificationAlertVariant}
        >
          {identificationAlert}
        </DancerAlert>
      ) : null}
    </AlertStack>
  );
}

/**
 * The whole page form: the card of fields and the pinned footer under it. Whoever
 * may edit gets the fields editable in place; anyone else sees them disabled with
 * only `Volver`.
 */
export function DancerDetailForm({
  backToList,
  canEdit,
  dancer,
  documentImageUrls,
  editForm,
  editFormId,
  isSaving,
  nameWarning,
  onSubmit,
  selectedEventId,
}: {
  backToList: string;
  canEdit: boolean;
  dancer: DancerDetailLoaderData["dancer"];
  documentImageUrls: DancerDetailLoaderData["documentImageUrls"];
  editForm: DancerEditFormController;
  editFormId: string;
  isSaving: boolean;
  nameWarning?: RosterNameWarning;
  onSubmit: SubmitEventHandler<HTMLFormElement>;
  selectedEventId: string | null;
}) {
  return (
    <form
      id={editFormId}
      method="post"
      noValidate
      className="flex flex-1 flex-col gap-6"
      onSubmit={onSubmit}
    >
      <input type="hidden" name="intent" value="update-dancer" />
      <AdminResourceFormCard>
        <DancerAdministrativeDataSection
          canEdit={canEdit}
          dancer={dancer}
          editForm={editForm}
        />
        <DancerDetailTabs
          canEdit={canEdit}
          dancer={dancer}
          documentImageUrls={documentImageUrls}
          editForm={editForm}
          selectedEventId={selectedEventId}
        />
      </AdminResourceFormCard>

      <FormActions
        backTo={backToList}
        canEdit={canEdit}
        // The warning carries the save of its own, so the footer must not
        // offer a second one.
        canSave={!nameWarning}
        hasChanges={editForm.hasChanges}
        isPending={isSaving}
        onDiscard={editForm.discard}
      />
    </form>
  );
}

function DancerAdministrativeDataSection({
  dancer,
  editForm,
  canEdit,
}: {
  canEdit: boolean;
  dancer: DancerDetailLoaderData["dancer"];
  editForm: DancerEditFormController;
}) {
  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      <ReadOnlyField
        className="md:col-span-2"
        label="Academia"
        value={dancer.academy.name}
      />
      {canEdit ? (
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
  );
}

function DancerDetailTabs({
  dancer,
  documentImageUrls,
  editForm,
  canEdit,
  selectedEventId,
}: {
  dancer: DancerDetailLoaderData["dancer"];
  documentImageUrls: DancerDetailLoaderData["documentImageUrls"];
  editForm: DancerEditFormController;
  canEdit: boolean;
  selectedEventId: string | null;
}) {
  return (
    <Tabs defaultValue="identificacion">
      <TabsList variant="line">
        <TabsTrigger value="identificacion">Identificación</TabsTrigger>
        <TabsTrigger value="inscripciones">Inscripciones</TabsTrigger>
      </TabsList>
      <TabsContent value="identificacion" className="pt-2">
        <DancerIdentificationSection
          dancer={dancer}
          documentImageUrls={documentImageUrls}
          editForm={editForm}
          canEdit={canEdit}
        />
      </TabsContent>
      <TabsContent value="inscripciones" className="pt-2">
        <InscriptionsSection
          academyId={dancer.academy.id}
          inscriptions={dancer.inscriptions}
          selectedEventId={selectedEventId}
        />
      </TabsContent>
    </Tabs>
  );
}

function DancerIdentificationSection({
  dancer,
  documentImageUrls,
  editForm,
  canEdit,
}: {
  dancer: DancerDetailLoaderData["dancer"];
  documentImageUrls: DancerDetailLoaderData["documentImageUrls"];
  editForm: DancerEditFormController;
  canEdit: boolean;
}) {
  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      {canEdit ? (
        <>
          <DancerBirthDateField
            eventStartDate={editForm.eventStartDate}
            form={editForm.form}
          />
          <div aria-hidden="true" className="hidden md:block" />
          <SelectField
            allowEmpty
            contentProps={{
              align: "start",
              position: "popper",
              side: "bottom",
            }}
            control={editForm.form.control}
            emptyLabel={documentTypeEmptyLabel}
            label="Tipo de documento"
            name="documentType"
            options={documentTypeOptions}
            placeholder={documentTypeEmptyLabel}
          />
          <DancerTextField
            description={editForm.documentConflictDescription}
            form={editForm.form}
            label="Número de documento"
            name="documentNumber"
          />
          <ReadOnlyDocumentImageField
            label="Imagen frente del documento"
            name="documentFrontImageStorageKey"
            storageKey={dancer.documentFrontImageStorageKey}
            url={documentImageUrls.front}
          />
          <ReadOnlyDocumentImageField
            label="Imagen dorso del documento"
            name="documentBackImageStorageKey"
            storageKey={dancer.documentBackImageStorageKey}
            url={documentImageUrls.back}
          />
        </>
      ) : (
        <>
          <ReadOnlyDateField
            label="Fecha de nacimiento"
            value={dancer.birthDate}
          />
          <div aria-hidden="true" className="hidden md:block" />
          <ReadOnlySelectField
            emptyLabel={documentTypeEmptyLabel}
            label="Tipo de documento"
            options={documentTypeOptions}
            value={dancer.documentType}
          />
          <ReadOnlyField
            label="Número de documento"
            value={dancer.documentNumber ?? ""}
          />
          <ReadOnlyDocumentImageField
            label="Imagen frente del documento"
            storageKey={dancer.documentFrontImageStorageKey}
            url={documentImageUrls.front}
          />
          <ReadOnlyDocumentImageField
            label="Imagen dorso del documento"
            storageKey={dancer.documentBackImageStorageKey}
            url={documentImageUrls.back}
          />
        </>
      )}
    </FieldGroup>
  );
}

function DancerAlert({
  action,
  children,
  title,
  variant = "warning",
}: {
  action?: {
    label: string;
    onClick: () => void;
  };
  children: ReactNode;
  title: string;
  variant?: "destructive" | "info" | "warning";
}) {
  const DancerAlertIcon = alertVariantIcons[variant];

  return (
    <Alert variant={variant}>
      <DancerAlertIcon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
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
  academyId,
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
    <DancerInscriptionsTable
      buildChoreographyHref={(choreographyId) =>
        choreographyDetailPath({ academyId, choreographyId })
      }
      inscriptions={inscriptions}
    />
  );
}
