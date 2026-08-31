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
  updateChoreographyScheduleCapacityIntent,
  updateChoreographySubmodalityIntent,
} from "./shared";
import { useSavedValueSelectForm } from "./use-saved-value-select-form";
import type { ChoreographyDetailLoaderData } from "./server";

/**
 * Los tres campos que se reasignan solos: cada uno tiene su propio `useForm`
 * aislado del form del roster, auto-submitea al elegir y postea su intent, así
 * que se quedan en la página y responden por toast. Ninguno participa del
 * guardado del roster ni de su diálogo de confirmación.
 */
export function SubmodalityField({
  loaderData,
}: {
  loaderData: ChoreographyDetailLoaderData;
}) {
  const choreography = loaderData.choreography;
  const submit = useSubmit();
  const submodalityForm = useSavedValueSelectForm(
    "submodalityId",
    choreography.submodalityId ?? "",
  );

  // Editable only for `admin`, when the modalidad has submodalidades and the
  // choreography has no presentación yet. Changing the modalidad itself is a
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
  experienceLevelId,
  loaderData,
  requiresExperienceLevel,
}: {
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

  // `canReassign` mira la categoría guardada; el prop la reemplaza mientras hay
  // un cambio de roster pendiente que la mueve.
  if (!loaderData.experienceLevel.canReassign || !requiresExperienceLevel) {
    return (
      <ReadOnlySelectField
        // Dos vacíos distintos: la categoría no pide nivel, o lo pide y falta.
        // Sin la distinción, una coreografía incompleta se ve igual que una que
        // está bien.
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
  loaderData,
}: {
  loaderData: ChoreographyDetailLoaderData;
}) {
  const choreography = loaderData.choreography;
  const submit = useSubmit();
  const scheduleCapacityForm = useSavedValueSelectForm(
    assignedScheduleCapacityFieldName,
    choreography.scheduleCapacityId,
  );

  if (!loaderData.scheduleCapacity.canReassign) {
    return (
      <ReadOnlyField label="Cronograma" value={choreography.scheduleLabel} />
    );
  }

  return (
    <SelectField
      control={scheduleCapacityForm.control}
      label="Cronograma"
      name={assignedScheduleCapacityFieldName}
      onValueChange={(value) => {
        if (!value || value === choreography.scheduleCapacityId) {
          return;
        }

        const formData = new FormData();
        formData.set("intent", updateChoreographyScheduleCapacityIntent);
        formData.set(assignedScheduleCapacityFieldName, value);
        submit(formData, { method: "post" });
      }}
      options={toScheduleCapacitySelectOptions(
        loaderData.scheduleCapacity.options,
      )}
      placeholder="Elegí el cronograma"
    />
  );
}
