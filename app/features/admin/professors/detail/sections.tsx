import { RosterNameWarningNotice } from "@/components/shared/roster-name-warning";
import type { RosterNameWarning } from "@/lib/roster/roster-name-duplicates";
import { Check, Pencil, TriangleAlert } from "lucide-react";
import type { FormEventHandler } from "react";
import { Link } from "react-router";

import { AdminResourceFormCard } from "@/components/admin/resource-layout";
import { BackButton } from "@/components/shared/action-buttons";
import { AlertStack } from "@/components/shared/alert-stack";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
  statusAction,
}: {
  canEdit: boolean;
  onSelectIntent: (intent: ProfessorStatusIntent) => void;
  statusAction: ProfessorStatusAction;
}) {
  if (!canEdit) {
    return null;
  }

  return (
    <ProfessorActionsMenu
      onSelect={onSelectIntent}
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
          <AlertDescription>Faltan datos de identificación.</AlertDescription>
        </Alert>
      ) : null}
    </AlertStack>
  );
}

export function ProfessorDetailCard({
  backToList,
  cancelHref,
  canEdit,
  editForm,
  editFormId,
  editHref,
  isEditing,
  nameWarning,
  onSubmit,
  professor,
}: {
  backToList: string;
  cancelHref: string;
  canEdit: boolean;
  editForm: ProfessorEditFormController;
  editFormId: string;
  editHref: string;
  isEditing: boolean;
  nameWarning?: RosterNameWarning;
  onSubmit: FormEventHandler<HTMLFormElement>;
  professor: ProfessorDetailLoaderData["professor"];
}) {
  return (
    <AdminResourceFormCard
      footer={
        <ProfessorDetailFooterActions
          backToList={backToList}
          canEdit={canEdit}
          cancelHref={cancelHref}
          editFormId={editFormId}
          editHref={editHref}
          // The warning carries the save of its own, so the footer must not
          // offer a second one.
          isEditing={isEditing && !nameWarning}
        />
      }
    >
      <form
        id={editFormId}
        method="post"
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-6"
      >
        <input type="hidden" name="intent" value="update-professor" />
        <ProfessorAdministrativeDataSection
          editForm={editForm}
          isEditing={isEditing}
          professor={professor}
        />

        {nameWarning ? <RosterNameWarningNotice warning={nameWarning} /> : null}
      </form>
    </AdminResourceFormCard>
  );
}

function ProfessorAdministrativeDataSection({
  editForm,
  isEditing,
  professor,
}: {
  editForm: ProfessorEditFormController;
  isEditing: boolean;
  professor: ProfessorDetailLoaderData["professor"];
}) {
  return (
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

function ProfessorDetailFooterActions({
  backToList,
  canEdit,
  cancelHref,
  editFormId,
  editHref,
  isEditing,
}: {
  backToList: string;
  canEdit: boolean;
  cancelHref: string;
  editFormId: string;
  editHref: string;
  isEditing: boolean;
}) {
  return (
    <>
      {isEditing ? (
        <Button asChild variant="outline">
          <Link to={cancelHref}>Cancelar</Link>
        </Button>
      ) : (
        <BackButton to={backToList} />
      )}
      <ProfessorPrimaryFooterAction
        canEdit={canEdit}
        editFormId={editFormId}
        editHref={editHref}
        isEditing={isEditing}
      />
    </>
  );
}

function ProfessorPrimaryFooterAction({
  canEdit,
  editFormId,
  editHref,
  isEditing,
}: {
  canEdit: boolean;
  editFormId: string;
  editHref: string;
  isEditing: boolean;
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

  return (
    <Button type="submit" form={editFormId}>
      <Check aria-hidden="true" data-icon="inline-start" />
      Guardar
    </Button>
  );
}
