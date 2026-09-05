import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toScheduleCapacitySelectOptions } from "@/lib/choreographies/schedule-capacity-options";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";

import {
  getModalityScheduleCapacityDeadEndMessage,
  getModalitySelectOptions,
} from "./modality-form-state";
import type { ChoreographyModalityResolution } from "./modality.server";
import type { ChoreographyDetailLoaderData } from "./server";
import type { useModalityForm } from "./use-modality-form";

type ModalityFieldProps = {
  loaderData: ChoreographyDetailLoaderData;
  modality: ReturnType<typeof useModalityForm>;
};

/**
 * The three dependent fields only exist once the resolution answered. Until
 * then the page keeps the saved-value fields on screen, disabled, so no
 * control next to the modality select changes shape mid-round-trip.
 */
type ResolvedModalityFieldProps = {
  modality: ReturnType<typeof useModalityForm>;
  resolution: ChoreographyModalityResolution;
};

/**
 * One slot per field the modality correction rewrites — submodality,
 * experience level and schedule capacity — with the precedence written once instead
 * of at each of the three.
 *
 * The correction wins as soon as its resolution answered, because it rewrites
 * all three at once. Until then the field keeps showing the saved value in the
 * same control, only disabled: swapping it for a read-only one and back flashes
 * a control next to the modality select twice in a single round-trip, and
 * disabling it is already enough to stop anyone picking a value the resolution
 * is about to discard. The roster form and the modality block exclude each
 * other on screen, so a slot never has two candidates.
 */
export function DependentFieldSlot({
  modality,
  resolved,
  saved,
}: {
  modality: ReturnType<typeof useModalityForm>;
  resolved: (resolution: ChoreographyModalityResolution) => ReactNode;
  saved: (disabled: boolean) => ReactNode;
}) {
  return modality.resolution
    ? resolved(modality.resolution)
    : saved(modality.isDirty);
}

const noCompatibleCategoryDescription =
  "Con esta modalidad no hay categoría compatible. Se puede guardar igual y la coreografía queda incompleta.";

export function ModalityField({ loaderData, modality }: ModalityFieldProps) {
  const choreography = loaderData.choreography;

  if (!modality.canCorrectModality) {
    return (
      <ReadOnlyField label="Modalidad" value={choreography.modalityName} />
    );
  }

  return (
    <SelectField
      control={modality.form.control}
      description={
        modality.isDirty && modality.resolution?.category === null
          ? noCompatibleCategoryDescription
          : undefined
      }
      label="Modalidad"
      name="modalityId"
      options={getModalitySelectOptions(loaderData.modality.options)}
      placeholder="Elegí la modalidad"
    />
  );
}

export function ModalitySubmodalityField({
  modality,
  resolution,
}: ResolvedModalityFieldProps) {
  if (resolution.submodality.options.length === 0) {
    return (
      <ReadOnlySelectField
        emptyLabel="No aplica"
        label="Submodalidad"
        options={[]}
        value=""
      />
    );
  }

  return (
    <SelectField
      control={modality.form.control}
      label="Submodalidad"
      name="modalitySubmodalityId"
      options={resolution.submodality.options.map((option) => ({
        label: option.name,
        value: option.id,
      }))}
      placeholder="Elegí la submodalidad"
    />
  );
}

export function ModalityExperienceLevelField({
  modality,
  resolution,
}: ResolvedModalityFieldProps) {
  if (!resolution.experienceLevel.required) {
    return (
      <ReadOnlySelectField
        emptyLabel="No aplica"
        label="Nivel de experiencia"
        options={[]}
        value=""
      />
    );
  }

  return (
    <SelectField
      control={modality.form.control}
      label="Nivel de experiencia"
      name="modalityExperienceLevelId"
      options={resolution.experienceLevel.options.map((option) => ({
        label: option.name,
        value: option.id,
      }))}
      placeholder="Elegí el nivel"
    />
  );
}

export function ModalityScheduleCapacityField({
  modality,
  resolution,
}: ResolvedModalityFieldProps) {
  const scheduleCapacity = resolution.scheduleCapacity;
  // An empty set and a set with no room are the same dead end on screen: an
  // empty select says nothing, so the reason takes its place. Emptiness is
  // reachable with the modality offered, because the price filter removes
  // capacities while the modality select stays structural.
  const deadEndMessage =
    getModalityScheduleCapacityDeadEndMessage(scheduleCapacity);

  if (deadEndMessage !== null) {
    return (
      <Alert variant="warning">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>No hay cupo de cronograma disponible</AlertTitle>
        <AlertDescription>{deadEndMessage}</AlertDescription>
      </Alert>
    );
  }

  // A single compatible capacity is not chosen: it stays preselected and
  // read-only, like the `auto` status of registration. It carries no label —
  // occupancy on a field nobody can change says nothing—, so the bare date-time
  // is composed here, the way the assigned `Cronograma` next door composes its
  // own.
  if (scheduleCapacity.status === "auto") {
    return (
      <ReadOnlyField
        label="Cronograma"
        value={formatScheduleDateTime(scheduleCapacity.options[0].schedule)}
      />
    );
  }

  return (
    <SelectField
      control={modality.form.control}
      label="Cronograma"
      name="modalityScheduleCapacityId"
      options={toScheduleCapacitySelectOptions(scheduleCapacity.options)}
      placeholder="Elegí el cronograma"
    />
  );
}
