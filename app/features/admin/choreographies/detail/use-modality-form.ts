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
 * What is required depends on the resolution, so the button is governed by
 * `canSubmitModalityCorrection` rather than by this schema. The capacity keeps its
 * rule anyway: the footer `Guardar` sits in the roster form, and a stray submit
 * from it must not write a correction with no capacity.
 */
const modalityFormSchema = z.object({
  modalityExperienceLevelId: z.string(),
  modalityId: z.string(),
  modalityScheduleCapacityId: z.string().min(1, requiredFieldMessage),
  modalitySubmodalityId: z.string(),
});

type ModalityFormValues = z.input<typeof modalityFormSchema>;

/**
 * The compound modality correction, shaped like the roster form: choosing a
 * candidate modality asks the server for the resolution over a fetcher, the
 * three dependent fields are filled or cleared from what comes back, and the
 * page's own `Guardar` writes it all in one transaction. Undoing it is
 * re-selecting the saved modality, which the select always offers, so the
 * block adds no buttons of its own.
 *
 * It is a sibling of the roster form, not a field on it: the guards differ —the
 * modality needs the deposit guard over the capacity move, which the roster save
 * deliberately does not apply to the group type— which is why the two exclude
 * each other on screen instead of merging.
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
  // The mutual exclusion is screen-level only: the server cannot see that a
  // client form is dirty, and the real safety net is that each intent
  // re-resolves on its own before writing.
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
    // `watchedScheduleCapacityId` is read to decide the next state; including
    // it would re-fire the effect on its own output.
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
    /**
     * The category the slot shows while the correction is pending. `null`
     * leaves the persisted value in place.
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
