import { useSubmit } from "react-router";

import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
import { toScheduleCapacitySelectOptions } from "@/lib/choreographies/schedule-capacity-options";

import {
  assignedExperienceLevelFieldName,
  assignedScheduleCapacityFieldName,
  updateChoreographyExperienceLevelIntent,
  updateChoreographySubmodalityIntent,
} from "./shared";
import { useSavedValueSelectForm } from "./use-saved-value-select-form";
import type { ChoreographyDetailLoaderData } from "./server";
import type { useScheduleCapacityForm } from "./use-schedule-capacity-form";

/**
 * The three fields that reassign on their own: each has its own `useForm`,
 * isolated from the roster's form, and posts its own intent, so they stay on
 * the page and report back by toast. None of them takes part in saving the
 * roster or in its confirmation dialog.
 *
 * Two of them still write on selection; the schedule capacity holds the choice
 * until the page's `Guardar`, shaped like the modality correction next to it.
 * See `useScheduleCapacityForm`.
 *
 * `disabled` is what a pending modality correction uses to hold them while its
 * resolution is in flight: they keep showing the saved value in the same
 * control instead of collapsing into a read-only field, so nothing next to the
 * modality select changes shape between the click and the answer.
 */
export function SubmodalityField({
  disabled = false,
  loaderData,
}: {
  disabled?: boolean;
  loaderData: ChoreographyDetailLoaderData;
}) {
  const choreography = loaderData.choreography;
  const submit = useSubmit();
  const submodalityForm = useSavedValueSelectForm(
    "submodalityId",
    choreography.submodalityId ?? "",
  );

  // Editable only for `admin`, when the modality has submodalities and the
  // choreography has no presentation yet. Changing the modality itself is a
  // separate compound correction, which owns this field while it is pending.
  const isEditable =
    loaderData.canEdit &&
    !choreography.hasPresentation &&
    loaderData.submodalityOptions.length > 0;

  if (!isEditable) {
    return (
      <ReadOnlyField
        label="Submodalidad"
        value={choreography.submodalityName ?? ""}
      />
    );
  }

  return (
    <SelectField
      control={submodalityForm.control}
      disabled={disabled}
      label="Submodalidad"
      name="submodalityId"
      onValueChange={(value) => {
        if (!value || value === (choreography.submodalityId ?? "")) {
          return;
        }

        const formData = new FormData();
        formData.set("intent", updateChoreographySubmodalityIntent);
        formData.set("submodalityId", value);
        submit(formData, { method: "post" });
      }}
      options={loaderData.submodalityOptions.map((option) => ({
        label: option.name,
        value: option.id,
      }))}
      placeholder="Elegí la submodalidad"
    />
  );
}

export function ExperienceLevelField({
  disabled = false,
  experienceLevelId,
  loaderData,
  requiresExperienceLevel,
}: {
  disabled?: boolean;
  experienceLevelId: string;
  loaderData: ChoreographyDetailLoaderData;
  requiresExperienceLevel: boolean;
}) {
  const choreography = loaderData.choreography;
  const submit = useSubmit();
  const experienceLevelForm = useSavedValueSelectForm(
    assignedExperienceLevelFieldName,
    experienceLevelId,
  );
  const options = choreography.experienceLevelOptions.map((option) => ({
    label: option.name,
    value: option.id,
  }));

  // `canReassign` looks at the saved category; the prop replaces it while there is
  // a pending roster change that moves it.
  if (!loaderData.experienceLevel.canReassign || !requiresExperienceLevel) {
    return (
      <ReadOnlySelectField
        // Two different kinds of empty: the category does not ask for a level, or
        // it asks and it is missing. Without the distinction, an incomplete
        // choreography looks the same as one that is fine.
        emptyLabel={requiresExperienceLevel ? "Sin asignar" : "No aplica"}
        label="Nivel de experiencia"
        options={options}
        value={experienceLevelId}
      />
    );
  }

  return (
    <SelectField
      control={experienceLevelForm.control}
      disabled={disabled}
      label="Nivel de experiencia"
      name={assignedExperienceLevelFieldName}
      onValueChange={(value) => {
        if (!value || value === experienceLevelId) {
          return;
        }

        const formData = new FormData();
        formData.set("intent", updateChoreographyExperienceLevelIntent);
        formData.set(assignedExperienceLevelFieldName, value);
        submit(formData, { method: "post" });
      }}
      options={options}
      placeholder="Elegí el nivel"
    />
  );
}

export function ScheduleCapacityField({
  disabled = false,
  loaderData,
  scheduleCapacity,
}: {
  disabled?: boolean;
  loaderData: ChoreographyDetailLoaderData;
  scheduleCapacity: ReturnType<typeof useScheduleCapacityForm>;
}) {
  const choreography = loaderData.choreography;

  if (!scheduleCapacity.canReassign) {
    return (
      <ReadOnlyField label="Cronograma" value={choreography.scheduleLabel} />
    );
  }

  return (
    <SelectField
      control={scheduleCapacity.form.control}
      disabled={disabled}
      label="Cronograma"
      name={assignedScheduleCapacityFieldName}
      options={toScheduleCapacitySelectOptions(
        loaderData.scheduleCapacity.options,
      )}
      placeholder="Elegí el cronograma"
    />
  );
}
