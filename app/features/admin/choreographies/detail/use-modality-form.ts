import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useFetcher, useNavigation, useSubmit } from "react-router";
import { z } from "zod";

import { isRouteFormPending, requiredFieldMessage } from "@/lib/shared/forms";

import {
  getResolvedModalityFieldState,
  shouldResolveModalitySelection,
} from "./modality-form-state";
import type { ChoreographyModalityResolution } from "./modality.server";
import type {
  ChoreographyDetailLoaderData,
  ChoreographyModalityResolutionData,
} from "./server";
import {
  modalityFieldNames,
  resolveChoreographyModalityIntent,
  updateChoreographyModalityIntent,
} from "./shared";

/**
 * El cupo es el único campo obligatorio del bloque en el cliente: la
 * submodalidad y el nivel solo hacen falta cuando la resolución los pide, así
 * que los gobierna `canSubmitModalityCorrection` en lugar del esquema.
 */
const modalityFormSchema = z.object({
  modalityExperienceLevelId: z.string(),
  modalityId: z.string(),
  modalityScheduleCapacityId: z.string().min(1, requiredFieldMessage),
  modalitySubmodalityId: z.string(),
});

type ModalityFormValues = z.input<typeof modalityFormSchema>;

/**
 * La corrección compuesta de modalidad, con la misma forma que el form del
 * roster: al elegir una modalidad candidata se le pide la resolución al server
 * por fetcher, los tres campos dependientes se rellenan o se limpian con lo que
 * vuelve, y un solo `Guardar` lo escribe todo en una transacción.
 *
 * Es un form hermano del roster, no un campo suyo: las guardas difieren —la
 * modalidad necesita la guarda de la seña sobre el movimiento de cupo, que el
 * guardado del roster deliberadamente no aplica al tipo de grupo— y por eso los
 * dos se excluyen mutuamente en pantalla en lugar de fusionarse.
 */
export function useModalityForm({
  isRosterFormDirty,
  loaderData,
}: {
  isRosterFormDirty: boolean;
  loaderData: ChoreographyDetailLoaderData;
}) {
  const choreography = loaderData.choreography;
  const defaultValues = useMemo<ModalityFormValues>(
    () => ({
      modalityExperienceLevelId: "",
      modalityId: choreography.modalityId,
      modalityScheduleCapacityId: "",
      modalitySubmodalityId: "",
    }),
    [choreography.modalityId],
  );
  const form = useForm<ModalityFormValues>({
    defaultValues,
    mode: "onSubmit",
    resolver: zodResolver(modalityFormSchema),
  });
  const { clearErrors, reset, setError, setValue, watch } = form;
  const resolutionFetcher = useFetcher<ChoreographyModalityResolutionData>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [resolution, setResolution] =
    useState<ChoreographyModalityResolution | null>(null);
  const [resolvedModalityId, setResolvedModalityId] = useState("");
  const submittedModalityIdRef = useRef<string | null>(null);

  const selectedModalityId = watch("modalityId");
  const watchedExperienceLevelId = watch("modalityExperienceLevelId");
  const watchedScheduleCapacityId = watch("modalityScheduleCapacityId");
  const watchedSubmodalityId = watch("modalitySubmodalityId");

  const persistedModalityId = choreography.modalityId;
  const isDirty = selectedModalityId !== persistedModalityId;
  // La exclusión mutua es solo de pantalla: el server no puede ver que un form
  // del cliente está sucio, y la red de seguridad real es que cada intent
  // re-resuelve dentro de su propia transacción.
  const canCorrectModality =
    loaderData.modality.canCorrect && !isRosterFormDirty;
  const isResolving = resolutionFetcher.state !== "idle";
  const isSubmitting = isRouteFormPending(navigation, {
    intent: updateChoreographyModalityIntent,
  });

  useEffect(() => {
    reset(defaultValues);
    setResolution(null);
    setResolvedModalityId("");
    submittedModalityIdRef.current = null;
  }, [defaultValues, reset]);

  useEffect(() => {
    if (!isDirty) {
      setResolution(null);
      setResolvedModalityId("");
      submittedModalityIdRef.current = null;
      return;
    }

    if (
      !shouldResolveModalitySelection({
        canCorrectModality,
        persistedModalityId,
        resolvedModalityId,
        selectedModalityId,
        submittedModalityId: submittedModalityIdRef.current,
      })
    ) {
      return;
    }

    const formData = new FormData();
    formData.set("intent", resolveChoreographyModalityIntent);
    formData.set(modalityFieldNames.modalityId, selectedModalityId);

    resolutionFetcher.submit(formData, { method: "post" });
    submittedModalityIdRef.current = selectedModalityId;
  }, [
    canCorrectModality,
    isDirty,
    persistedModalityId,
    resolutionFetcher,
    resolvedModalityId,
    selectedModalityId,
  ]);

  useEffect(() => {
    const data = resolutionFetcher.data;

    if (
      !data ||
      data.intent !== resolveChoreographyModalityIntent ||
      submittedModalityIdRef.current === null
    ) {
      return;
    }

    setResolvedModalityId(submittedModalityIdRef.current);

    if (!data.result.ok) {
      setResolution(null);
      setError("modalityId", { message: data.result.message, type: "manual" });
      return;
    }

    clearErrors("modalityId");
    setResolution(data.result.resolution);

    const fieldState = getResolvedModalityFieldState({
      categoryId: choreography.categoryId,
      experienceLevelId: choreography.experienceLevelId,
      resolution: data.result.resolution,
      watchedScheduleCapacityId,
    });

    setValue("modalitySubmodalityId", fieldState.nextSubmodalityId);
    setValue("modalityExperienceLevelId", fieldState.nextExperienceLevelId);
    setValue("modalityScheduleCapacityId", fieldState.nextScheduleCapacityId);
    // `watchedScheduleCapacityId` se lee para decidir el próximo estado;
    // incluirlo re-dispararía el efecto sobre su propio output.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choreography, clearErrors, resolutionFetcher.data, setError, setValue]);

  const save = form.handleSubmit((values) => {
    const formData = new FormData();
    formData.set("intent", updateChoreographyModalityIntent);
    formData.set(modalityFieldNames.modalityId, values.modalityId);
    formData.set(
      modalityFieldNames.previewedCategoryId,
      resolution?.category?.id ?? "",
    );
    formData.set(
      modalityFieldNames.submodalityId,
      values.modalitySubmodalityId,
    );
    formData.set(
      modalityFieldNames.experienceLevelId,
      values.modalityExperienceLevelId,
    );
    formData.set(
      modalityFieldNames.scheduleCapacityId,
      values.modalityScheduleCapacityId,
    );

    submit(formData, { method: "post" });
  });

  return {
    canCorrectModality,
    cancel: () => reset(defaultValues),
    /**
     * La categoría que muestra el slot mientras la corrección está pendiente.
     * `null` deja el valor persistido en su lugar.
     */
    categoryLabel:
      isDirty && resolution
        ? (resolution.category?.name ?? "Sin asignar")
        : null,
    form,
    isDirty,
    isResolving,
    isSubmitting,
    persistedModalityId,
    resolution,
    resolvedModalityId,
    save,
    selectedModalityId,
    watchedExperienceLevelId,
    watchedScheduleCapacityId,
    watchedSubmodalityId,
  };
}
