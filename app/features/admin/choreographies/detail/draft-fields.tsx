import type { ReactNode } from "react";

import { ChecklistField } from "@/components/shared/checklist-field";
import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { FieldError, FieldLegend, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { toScheduleCapacitySelectOptions } from "@/lib/choreographies/schedule-capacity-options";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

import { getModalitySelectOptions } from "./draft-form";
import {
  getChoreographyDraftClassificationKey,
  type ChoreographyDraftBlockerCode,
} from "./draft.shared";
import type { ChoreographyDetailLoaderData } from "./server";
import type { useChoreographyDraft } from "./use-choreography-draft";

type DraftFieldsProps = {
  draft: ReturnType<typeof useChoreographyDraft>;
  loaderData: ChoreographyDetailLoaderData;
};

/**
 * `Academia` and `Nombre`, then the six classification fields in a two-column
 * grid. The ones the server derives keep their control while a preview is on
 * its way, marked busy, and take its answer in place.
 */
export function ChoreographyClassificationFields({
  draft,
  loaderData,
}: DraftFieldsProps) {
  const { choreography } = loaderData;
  const { preview } = draft;
  const shown = preview.shown;
  const isEditable = !draft.isStructureLocked;
  // Only a change of modality or dancers re-derives these fields: a capacity
  // picked on its own only waits for its consequences.
  const isDeriving =
    preview.isPending &&
    !shown.key.startsWith(
      `${getChoreographyDraftClassificationKey(draft.draft)}|`,
    );

  return (
    <>
      <ReadOnlyField label="Academia" value={choreography.academyName} />
      {loaderData.canEdit ? (
        <TextInputField
          control={draft.form.control}
          label="Nombre"
          name="name"
        />
      ) : (
        <ReadOnlyField label="Nombre" value={choreography.name} />
      )}

      <DerivedField reason={findReason(draft, "modality")}>
        {isEditable ? (
          <SelectField
            control={draft.form.control}
            label="Modalidad"
            name="modalityId"
            options={getModalitySelectOptions(
              loaderData.modality.options,
              choreography.modalityId,
            )}
            placeholder="Elegí la modalidad"
          />
        ) : (
          <ReadOnlyField label="Modalidad" value={choreography.modalityName} />
        )}
      </DerivedField>

      <DerivedField pending={isDeriving}>
        {isEditable && shown.submodality.options.length > 0 ? (
          <SelectField
            control={draft.form.control}
            disabled={isDeriving}
            label={<PendingLabel pending={isDeriving} text="Submodalidad" />}
            name="submodalityId"
            options={shown.submodality.options.map((option) => ({
              label: option.name,
              value: option.id,
            }))}
            placeholder="Elegí la submodalidad"
          />
        ) : (
          <ReadOnlySelectField
            emptyLabel="No aplica"
            label={<PendingLabel pending={isDeriving} text="Submodalidad" />}
            options={[]}
            value={isEditable ? "" : (choreography.submodalityName ?? "")}
          />
        )}
      </DerivedField>

      <DerivedField pending={isDeriving} reason={findReason(draft, "category")}>
        <ReadOnlyField
          label={<PendingLabel pending={isDeriving} text="Categoría" />}
          value={shown.category?.name ?? ""}
        />
      </DerivedField>

      <DerivedField pending={isDeriving}>
        <ReadOnlyField
          label={<PendingLabel pending={isDeriving} text="Tipo de grupo" />}
          value={formatGroupTypeLabel(shown.groupType)}
        />
      </DerivedField>

      <DerivedField pending={isDeriving}>
        <ExperienceLevelField
          draft={draft}
          isDeriving={isDeriving}
          loaderData={loaderData}
        />
      </DerivedField>

      <DerivedField
        pending={isDeriving}
        reason={findReason(draft, "schedule-capacity")}
      >
        <ScheduleCapacityField draft={draft} isDeriving={isDeriving} />
      </DerivedField>
    </>
  );
}

/**
 * Two different kinds of empty: the category does not ask for a level, or it
 * asks and it is missing. The second is what leaves the choreography
 * `Incompleta`, so it cannot read the same as the first.
 */
function ExperienceLevelField({
  draft,
  isDeriving,
  loaderData,
}: {
  draft: DraftFieldsProps["draft"];
  isDeriving: boolean;
  loaderData: ChoreographyDetailLoaderData;
}) {
  const { experienceLevel } = draft.preview.shown;
  const label = (
    <PendingLabel pending={isDeriving} text="Nivel de experiencia" />
  );

  if (!draft.isStructureLocked && experienceLevel.required) {
    return (
      <SelectField
        control={draft.form.control}
        disabled={isDeriving}
        label={label}
        name="experienceLevelId"
        options={experienceLevel.options.map((option) => ({
          label: option.name,
          value: option.id,
        }))}
        placeholder="Elegí el nivel de experiencia"
      />
    );
  }

  const { choreography } = loaderData;

  return (
    <ReadOnlyField
      label={label}
      value={
        (draft.isStructureLocked ? choreography.experienceLevelName : null) ??
        (experienceLevel.required ? "Sin asignar" : "No aplica")
      }
    />
  );
}

/**
 * A select only when there is a choice: a lone capacity arrives preselected and
 * read-only, and full ones are offered disabled.
 */
function ScheduleCapacityField({
  draft,
  isDeriving,
}: {
  draft: DraftFieldsProps["draft"];
  isDeriving: boolean;
}) {
  const { options, selectedId } = draft.preview.shown.scheduleCapacity;
  const label = <PendingLabel pending={isDeriving} text="Cronograma" />;

  if (!draft.isStructureLocked && options.length > 1) {
    return (
      <SelectField
        control={draft.form.control}
        disabled={isDeriving}
        label={label}
        name="scheduleCapacityId"
        options={toScheduleCapacitySelectOptions(options)}
        placeholder="Elegí el cronograma"
      />
    );
  }

  const shownOption =
    options.find((option) => option.id === selectedId) ?? options[0];

  return <ReadOnlyField label={label} value={shownOption?.label ?? ""} />;
}

/**
 * `Bailarines` and `Profesores`, each an in-place checklist. They close with
 * the structure: the evaluation lock holds the roster and the professors alike.
 */
export function ChoreographyPeopleFields({
  draft,
  loaderData,
}: DraftFieldsProps) {
  const disabled = draft.isStructureLocked;

  return (
    <>
      <FieldSet className="gap-2">
        <FieldLegend variant="label">Bailarines</FieldLegend>
        <ChecklistField
          control={draft.form.control}
          disabled={disabled}
          emptySelectionMessage="Todavía no seleccionaste bailarines."
          label="Bailarines"
          name="dancerIds"
          options={loaderData.availableDancers.map(toPersonOption)}
          searchLabel="Buscar bailarines"
        />
        <FieldError>{findReason(draft, "dancers")}</FieldError>
      </FieldSet>
      <FieldSet className="gap-2">
        <FieldLegend variant="label">Profesores</FieldLegend>
        <ChecklistField
          control={draft.form.control}
          disabled={disabled}
          emptySelectionMessage="Todavía no seleccionaste profesores."
          label="Profesores"
          name="professorIds"
          options={loaderData.availableProfessors.map(toPersonOption)}
          searchLabel="Buscar profesores"
        />
      </FieldSet>
    </>
  );
}

/**
 * A field the preview can rewrite, with the reason the preview gave for it
 * right below. `aria-busy` tells assistive technology the value is about to
 * change.
 */
function DerivedField({
  children,
  pending = false,
  reason,
}: {
  children: ReactNode;
  pending?: boolean;
  reason?: string;
}) {
  return (
    <div aria-busy={pending} className="flex flex-col gap-2">
      {children}
      <FieldError>{reason}</FieldError>
    </div>
  );
}

function PendingLabel({ pending, text }: { pending: boolean; text: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      {text}
      {pending ? <Spinner className="size-3.5" /> : null}
    </span>
  );
}

/**
 * The reason for the field as it stands: once a preview answers the draft, its
 * blockers; while one is on its way, nothing, so a stale reason is not left
 * beside a field that already changed.
 */
function findReason(
  draft: DraftFieldsProps["draft"],
  code: ChoreographyDraftBlockerCode,
) {
  return draft.preview.current?.blockers.find(
    (blocker) => blocker.code === code,
  )?.message;
}

function toPersonOption(person: {
  firstName: string;
  id: string;
  lastName: string;
}) {
  return {
    label: `${person.firstName} ${person.lastName}`,
    value: person.id,
  };
}
