import { RosterNameWarningDialog } from "@/components/shared/roster-name-warning";
import type { RosterNameWarning } from "@/lib/roster/roster-name-duplicates";
import { TriangleAlert } from "lucide-react";
import type { SubmitEventHandler } from "react";

import { AdminResourceFormCard } from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { FormActions } from "@/components/shared/form-actions";
import { ArchivedPersonAlert } from "@/components/shared/archived-person-alert";
import { RosterPersonParticipatingAlert } from "@/components/shared/roster-person-participating-alert";
import {
  documentTypeEmptyLabel,
  documentTypeOptions,
} from "@/components/shared/document-type-options";
import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FieldGroup } from "@/components/ui/field";

import {
  ProfessorActionsMenu,
  ProfessorTextField,
  type ProfessorEditFormController,
} from "./form";
import {
  type ProfessorDetailLoaderData,
  type ProfessorDialogIntent,
  type ProfessorStatusAction,
} from "./shared";

type ProfessorStatusIntent = Exclude<ProfessorDialogIntent, "update-professor">;

export function ProfessorDetailHeaderActions({
  canEdit,
  onSelectIntent,
  onSelectMerge,
  statusAction,
}: {
  canEdit: boolean;
  onSelectIntent: (intent: ProfessorStatusIntent) => void;
  onSelectMerge: () => void;
  statusAction: ProfessorStatusAction;
}) {
  if (!canEdit) {
    return null;
  }

  return (
    <ProfessorActionsMenu
      onSelect={onSelectIntent}
      onSelectMerge={onSelectMerge}
      statusAction={statusAction}
    />
  );
}

export function ProfessorDetailAlerts({
  active,
  canEdit,
  isIncomplete,
  onSelectIntent,
  participatingAlert,
}: {
  active: boolean;
  canEdit: boolean;
  isIncomplete: boolean;
  onSelectIntent: (intent: ProfessorStatusIntent) => void;
  participatingAlert: string | null;
}) {
  return (
    <AlertStack>
      {!active ? (
        <ArchivedPersonAlert
          personLabel="profesor"
          onReactivate={
            canEdit ? () => onSelectIntent("reactivate-professor") : undefined
          }
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
 * The whole page form: the card of fields and the pinned footer under it. Whoever
 * may edit gets the fields editable in place; anyone else sees them disabled with
 * only `Volver`.
 */
export function ProfessorDetailForm({
  backToList,
  canEdit,
  editForm,
  editFormId,
  isSaving,
  nameWarning,
  onSubmit,
  professor,
}: {
  backToList: string;
  canEdit: boolean;
  editForm: ProfessorEditFormController;
  editFormId: string;
  isSaving: boolean;
  nameWarning?: RosterNameWarning;
  onSubmit: SubmitEventHandler<HTMLFormElement>;
  professor: ProfessorDetailLoaderData["professor"];
}) {
  return (
    <form
      id={editFormId}
      method="post"
      noValidate
      className="flex flex-1 flex-col gap-6"
      onSubmit={onSubmit}
    >
      <input type="hidden" name="intent" value="update-professor" />
      <AdminResourceFormCard>
        <ProfessorAdministrativeDataSection
          canEdit={canEdit}
          editForm={editForm}
          professor={professor}
        />
      </AdminResourceFormCard>

      <FormActions
        backTo={backToList}
        canEdit={canEdit}
        hasChanges={editForm.hasChanges}
        isPending={isSaving}
        onDiscard={editForm.discard}
      />
      {nameWarning ? (
        <RosterNameWarningDialog
          formId={editFormId}
          isPending={isSaving}
          warning={nameWarning}
        />
      ) : null}
    </form>
  );
}

function ProfessorAdministrativeDataSection({
  editForm,
  canEdit,
  professor,
}: {
  editForm: ProfessorEditFormController;
  canEdit: boolean;
  professor: ProfessorDetailLoaderData["professor"];
}) {
  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      <ReadOnlyField
        className="md:col-span-2"
        label="Academia"
        value={professor.academy.name}
      />
      {canEdit ? (
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
          <ProfessorTextField
            description={editForm.documentConflictDescription}
            form={editForm.form}
            label="Número de documento"
            name="documentNumber"
          />
        </>
      ) : (
        <>
          <ReadOnlyField label="Nombre" value={professor.firstName} />
          <ReadOnlyField label="Apellido" value={professor.lastName} />
          <ReadOnlySelectField
            emptyLabel={documentTypeEmptyLabel}
            label="Tipo de documento"
            options={documentTypeOptions}
            value={professor.documentType}
          />
          <ReadOnlyField
            label="Número de documento"
            value={professor.documentNumber ?? ""}
          />
        </>
      )}
    </FieldGroup>
  );
}
