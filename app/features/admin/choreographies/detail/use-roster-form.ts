import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useNavigation } from "react-router";
import type { UseFormReturn } from "react-hook-form";

import type { ResolveChoreographyDancersResult } from "@/lib/choreographies/choreography-roster.server";
import { isRouteFormPending } from "@/lib/shared/forms";

import {
  getPersistedRosterResolutionState,
  getResolvedRosterFieldState,
  getScheduleResolution,
  getSelectionKey,
  hasResolvedRosterSelectionChange,
  shouldResolveRosterSelection,
  type AdministrativeRosterResolutionState,
} from "./roster-form-state";
import type {
  AdministrativeChoreographyRosterResolutionData,
  AdministrativeChoreographyDetailLoaderData,
} from "./server";
import {
  resolveAdministrativeChoreographyRosterIntent,
  updateAdministrativeChoreographyRosterIntent,
} from "./shared";

type RosterFormValues = {
  dancerIds: string[];
  experienceLevelId: string;
  musicStorageKey: string;
  name: string;
  professorIds: string[];
  scheduleCapacityId: string;
};

/**
 * Re-resuelve tipo de grupo, categoría y nivel contra el server cada vez que
 * cambia la selección de bailarines. La deduplicación es por clave de selección
 * (no por timer): cada selección se pide una sola vez, y volver a la selección
 * original no dispara pedido porque ya conocemos su resolución persistida.
 */
export function useAdministrativeRosterForm({
  form,
  loaderData,
}: {
  form: UseFormReturn<RosterFormValues>;
  loaderData: AdministrativeChoreographyDetailLoaderData;
}) {
  const choreography = loaderData.choreography;
  const resolutionFetcher =
    useFetcher<AdministrativeChoreographyRosterResolutionData>();
  const navigation = useNavigation();

  const persistedResolution = useMemo(
    () => getPersistedRosterResolutionState(choreography),
    [choreography],
  );
  const [derivedResolution, setDerivedResolution] =
    useState<AdministrativeRosterResolutionState>(persistedResolution);
  const [resolution, setResolution] =
    useState<ResolveChoreographyDancersResult | null>(null);
  const [resolvedSelectionKey, setResolvedSelectionKey] = useState("");
  const submittedSelectionKeyRef = useRef<string | null>(null);

  const watchedDancerIds = form.watch("dancerIds");
  const watchedProfessorIds = form.watch("professorIds");
  const watchedName = form.watch("name");
  const watchedExperienceLevelId = form.watch("experienceLevelId");
  const watchedScheduleCapacityId = form.watch("scheduleCapacityId");

  const persistedDancerIds = useMemo(
    () => choreography.dancers.map((dancer) => dancer.id),
    [choreography.dancers],
  );
  const persistedProfessorIds = useMemo(
    () => choreography.professors.map((professor) => professor.id),
    [choreography.professors],
  );

  const selectionKey = getSelectionKey(watchedDancerIds);
  const persistedSelectionKey = getSelectionKey(persistedDancerIds);
  const hasRosterChanged = selectionKey !== persistedSelectionKey;
  const hasProfessorsChanged =
    getSelectionKey(watchedProfessorIds) !==
    getSelectionKey(persistedProfessorIds);
  const hasNameChanged = watchedName.trim() !== choreography.name;

  const canEditRoster = loaderData.canEdit && !choreography.hasPresentation;
  const isResolving = resolutionFetcher.state !== "idle";
  const isSubmitting = isRouteFormPending(navigation, {
    intent: updateAdministrativeChoreographyRosterIntent,
  });

  useEffect(() => {
    if (!hasRosterChanged) {
      setDerivedResolution(persistedResolution);
      setResolution(null);
      setResolvedSelectionKey(persistedSelectionKey);
      submittedSelectionKeyRef.current = null;
      form.setValue("scheduleCapacityId", "", { shouldDirty: false });
      return;
    }

    if (
      !shouldResolveRosterSelection({
        canEditRoster,
        hasRosterChanged,
        resolvedSelectionKey,
        selectionKey,
        submittedSelectionKey: submittedSelectionKeyRef.current,
        watchedDancerIds,
      })
    ) {
      return;
    }

    const formData = new FormData();
    formData.set("intent", resolveAdministrativeChoreographyRosterIntent);
    for (const dancerId of watchedDancerIds) {
      formData.append("dancerIds", dancerId);
    }

    resolutionFetcher.submit(formData, { method: "post" });
    submittedSelectionKeyRef.current = selectionKey;
  }, [
    canEditRoster,
    form,
    hasRosterChanged,
    persistedResolution,
    persistedSelectionKey,
    resolutionFetcher,
    resolvedSelectionKey,
    selectionKey,
    watchedDancerIds,
  ]);

  useEffect(() => {
    const data = resolutionFetcher.data;

    if (
      !data ||
      data.intent !== resolveAdministrativeChoreographyRosterIntent ||
      submittedSelectionKeyRef.current === null
    ) {
      return;
    }

    setResolution(data.result);
    setResolvedSelectionKey(submittedSelectionKeyRef.current);

    if (!data.result.ok) {
      form.setError("dancerIds", {
        message: data.result.message,
        type: "manual",
      });
      form.setValue("scheduleCapacityId", "", { shouldDirty: true });
      return;
    }

    form.clearErrors("dancerIds");

    const fieldState = getResolvedRosterFieldState({
      currentCategoryId: derivedResolution.categoryId,
      result: data.result,
      watchedScheduleCapacityId,
    });

    setDerivedResolution(fieldState.nextDerivedResolution);

    if (fieldState.shouldResetExperienceLevel) {
      form.setValue("experienceLevelId", "", { shouldDirty: true });
    }

    form.setValue("scheduleCapacityId", fieldState.nextScheduleCapacityId, {
      shouldDirty: true,
    });
    // `derivedResolution` y `watchedScheduleCapacityId` se leen para decidir el
    // próximo estado; incluirlos re-dispararía el efecto sobre su propio output.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, resolutionFetcher.data]);

  const scheduleResolution = getScheduleResolution(resolution);
  const hasResolvedRosterChange = hasResolvedRosterSelectionChange({
    hasRosterChanged,
    resolution,
    resolvedSelectionKey,
    selectionKey,
  });

  return {
    canEditRoster,
    derivedResolution,
    hasNameChanged,
    hasProfessorsChanged,
    hasResolvedRosterChange,
    hasRosterChanged,
    isResolving,
    isSubmitting,
    resolution,
    resolvedSelectionKey,
    scheduleResolution,
    selectionKey,
    watchedDancerIds,
    watchedExperienceLevelId,
    watchedScheduleCapacityId,
  };
}
