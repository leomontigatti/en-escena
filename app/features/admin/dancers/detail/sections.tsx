import { RosterNameWarningDialog } from "@/components/shared/roster-name-warning";
import type { RosterNameWarning } from "@/lib/roster/roster-name-duplicates";
import { type SubmitEventHandler, type ReactNode } from "react";

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
import { DancerInscriptionsTable } from "@/components/shared/roster-inscriptions-table";
import { RosterSeminarInscriptionsTable } from "@/components/shared/roster-seminar-inscriptions-table";
import { useResetListQuery } from "@/components/shared/data-table-url-state";
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
import { SelectField } from "@/components/shared/select-field";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { basePath as seminarsPath } from "@/features/admin/seminars/shared";

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

  // The destructive items sit last, after a separator: `Archivar` and
  // `Fusionar`, or `Fusionar` alone when the status action is the reactivation.
  const isArchive = statusAction.intent === "archive-dancer";

  return (
    <ResourceActionsMenu>
      {canVerifyIdentity ? (
        <DropdownMenuItem onSelect={() => onSelectIntent("verify")}>
          Verificar
        </DropdownMenuItem>
      ) : null}
      {canVerifyIdentity && isArchive ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem
        variant={isArchive ? "destructive" : "default"}
        onSelect={() => onSelectIntent(statusAction.intent)}
      >
        {statusAction.label}
      </DropdownMenuItem>
      {isArchive ? null : <DropdownMenuSeparator />}
      <DropdownMenuItem variant="destructive" onSelect={() => onSelectMerge()}>
        Fusionar
      </DropdownMenuItem>
    </ResourceActionsMenu>
  );
}

export function DancerDetailAlerts({
  active,
  canEdit,
  canVerifyIdentity,
  identificationAlert,
  identificationAlertTitle,
  identificationAlertVariant,
  onSelectIntent,
  recategorisedChoreographies,
}: {
  active: boolean;
  canEdit: boolean;
  canVerifyIdentity: boolean;
  identificationAlert: string | null;
  identificationAlertTitle: string;
  identificationAlertVariant: "info" | "warning";
  onSelectIntent: (intent: DancerDialogIntent) => void;
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
      {recategorisedChoreographies.length > 0 ? (
        <RecategorisedChoreographiesAlert
          buildChoreographyHref={choreographyDetailPath}
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
 * The dancer's three tabs. `Identificación` is the whole page form: the card of
 * fields, closed by its pinned footer. Whoever may edit gets the fields
 * editable in place; anyone else sees them disabled with only `Volver`.
 * `Inscripciones` and `Seminarios` are tables of their own, outside the card.
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
  const resetListQuery = useResetListQuery();

  return (
    <Tabs defaultValue="identificacion" onValueChange={resetListQuery}>
      <TabsList variant="line">
        <TabsTrigger value="identificacion">Identificación</TabsTrigger>
        <TabsTrigger value="inscripciones">Inscripciones</TabsTrigger>
        <TabsTrigger value="seminarios">Seminarios</TabsTrigger>
      </TabsList>
      {/* Kept mounted behind the other tab, so the leave guard in `Guardar`'s
          footer still covers the draft from there. */}
      <TabsContent
        forceMount
        value="identificacion"
        className="pt-2 data-[state=inactive]:hidden"
      >
        <form
          id={editFormId}
          method="post"
          noValidate
          className="flex flex-1 flex-col gap-6"
          onSubmit={onSubmit}
        >
          <input type="hidden" name="intent" value="update-dancer" />
          <AdminResourceFormCard
            footer={
              <FormActions
                backTo={backToList}
                canEdit={canEdit}
                hasChanges={editForm.hasChanges}
                isPending={isSaving}
                onDiscard={editForm.discard}
              />
            }
          >
            <ReadOnlyField label="Academia" value={dancer.academy.name} />
            <DancerIdentificationSection
              dancer={dancer}
              documentImageUrls={documentImageUrls}
              editForm={editForm}
              canEdit={canEdit}
            />
          </AdminResourceFormCard>
          {nameWarning ? (
            <RosterNameWarningDialog
              formId={editFormId}
              isPending={isSaving}
              warning={nameWarning}
            />
          ) : null}
        </form>
      </TabsContent>
      <TabsContent value="inscripciones" className="pt-2">
        <InscriptionsSection
          inscriptions={dancer.inscriptions}
          selectedEventId={selectedEventId}
        />
      </TabsContent>
      <TabsContent value="seminarios" className="pt-2">
        <SeminarInscriptionsSection
          inscriptions={dancer.seminarInscriptions}
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
          <DancerBirthDateField form={editForm.form} />
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
          <ReadOnlyField label="Nombre" value={dancer.firstName} />
          <ReadOnlyField label="Apellido" value={dancer.lastName} />
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

  return (
    <DancerInscriptionsTable
      buildChoreographyHref={choreographyDetailPath}
      inscriptions={inscriptions}
    />
  );
}

function SeminarInscriptionsSection({
  inscriptions,
  selectedEventId,
}: {
  inscriptions: DancerDetailLoaderData["dancer"]["seminarInscriptions"];
  selectedEventId: string | null;
}) {
  if (!selectedEventId) {
    return (
      <AdminEmptyState
        title="Sin evento activo"
        description="No hay un evento activo seleccionado para revisar seminarios."
      />
    );
  }

  return (
    <RosterSeminarInscriptionsTable
      buildSeminarHref={(seminarId) => `${seminarsPath}/${seminarId}`}
      inscriptions={inscriptions}
      personKind="dancer"
    />
  );
}
