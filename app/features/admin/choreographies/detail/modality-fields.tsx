import { Check, LoaderCircle } from "lucide-react";

import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  isEveryScheduleCapacityOptionFull,
  toScheduleCapacitySelectOptions,
} from "@/lib/choreographies/schedule-capacity-options";

import {
  canSubmitModalityCorrection,
  everyModalityScheduleCapacityFullMessage,
  getModalitySelectOptions,
  isModalityScheduleCapacityLocked,
} from "./modality-form-state";
import type { ChoreographyDetailLoaderData } from "./server";
import type { useModalityForm } from "./use-modality-form";

type ModalityFieldProps = {
  loaderData: ChoreographyDetailLoaderData;
  modality: ReturnType<typeof useModalityForm>;
};

const noCompatibleCategoryDescription =
  "Con esta modalidad no hay categoría compatible. Se puede guardar igual y la coreografía queda incompleta.";

/**
 * While the resolution is in flight the three dependent fields show what is
 * saved: offering options the resolution may change invites picking something
 * the save discards.
 */
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
  loaderData,
  modality,
}: ModalityFieldProps) {
  const resolution = modality.resolution;

  if (!resolution) {
    return (
      <ReadOnlyField
        label="Submodalidad"
        value={loaderData.choreography.submodalityName ?? ""}
      />
    );
  }

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
  loaderData,
  modality,
}: ModalityFieldProps) {
  const resolution = modality.resolution;

  if (!resolution) {
    return (
      <ReadOnlyField
        label="Nivel de experiencia"
        value={loaderData.choreography.experienceLevelName ?? ""}
      />
    );
  }

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
  loaderData,
  modality,
}: ModalityFieldProps) {
  const resolution = modality.resolution;

  if (!resolution) {
    return (
      <ReadOnlyField
        label="Cronograma"
        value={loaderData.choreography.scheduleLabel}
      />
    );
  }

  const options = resolution.scheduleCapacity.options;

  if (isEveryScheduleCapacityOptionFull(options)) {
    return (
      <Alert>
        <AlertTitle>No hay cupo de cronograma disponible</AlertTitle>
        <AlertDescription>
          {everyModalityScheduleCapacityFullMessage}
        </AlertDescription>
      </Alert>
    );
  }

  // A single compatible cupo is not chosen: it stays preselected and
  // read-only, like the `auto` status of registration.
  if (isModalityScheduleCapacityLocked(resolution)) {
    return (
      <ReadOnlySelectField
        label="Cronograma"
        options={toScheduleCapacitySelectOptions(options)}
        value={modality.watchedScheduleCapacityId}
      />
    );
  }

  return (
    <SelectField
      control={modality.form.control}
      label="Cronograma"
      name="modalityScheduleCapacityId"
      options={toScheduleCapacitySelectOptions(options)}
      placeholder="Elegí el cronograma"
    />
  );
}

/**
 * A single `Guardar` for the whole correction: modalidad, submodalidad,
 * categoría, nivel and cupo are written together or nothing is written.
 */
export function ModalityCorrectionActions({
  modality,
}: {
  modality: ReturnType<typeof useModalityForm>;
}) {
  if (!modality.isDirty) {
    return null;
  }

  const canSubmit = canSubmitModalityCorrection(modality);
  const isPending = modality.isResolving || modality.isSubmitting;

  return (
    <div className="flex flex-wrap justify-end gap-3 md:col-span-2">
      <Button onClick={modality.cancel} type="button" variant="outline">
        Cancelar
      </Button>
      <Button disabled={!canSubmit} onClick={modality.save} type="button">
        {isPending ? (
          <LoaderCircle
            aria-hidden="true"
            className="animate-spin"
            data-icon="inline-start"
          />
        ) : (
          <Check aria-hidden="true" data-icon="inline-start" />
        )}
        Guardar modalidad
      </Button>
    </div>
  );
}
