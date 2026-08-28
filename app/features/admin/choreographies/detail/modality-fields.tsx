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
 * Mientras la resolución está en vuelo los tres campos dependientes muestran lo
 * guardado: ofrecer opciones que la resolución puede cambiar invita a elegir
 * algo que el guardado descarta.
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

  // Un solo cupo compatible no se elige: queda preseleccionado y de solo
  // lectura, igual que el estado `auto` del alta.
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
 * Un solo `Guardar` para toda la corrección: modalidad, submodalidad,
 * categoría, nivel y cupo se escriben juntos o no se escribe nada.
 */
export function ModalityCorrectionActions({
  modality,
}: {
  modality: ReturnType<typeof useModalityForm>;
}) {
  if (!modality.isDirty) {
    return null;
  }

  const canSubmit = canSubmitModalityCorrection({
    canCorrectModality: modality.canCorrectModality,
    isResolving: modality.isResolving,
    isSubmitting: modality.isSubmitting,
    persistedModalityId: modality.persistedModalityId,
    resolution: modality.resolution,
    resolvedModalityId: modality.resolvedModalityId,
    selectedModalityId: modality.selectedModalityId,
    watchedExperienceLevelId: modality.watchedExperienceLevelId,
    watchedScheduleCapacityId: modality.watchedScheduleCapacityId,
    watchedSubmodalityId: modality.watchedSubmodalityId,
  });
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
