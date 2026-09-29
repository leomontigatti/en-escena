import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useFetcher, useSearchParams } from "react-router";

import {
  clearStoredAnswers,
  getAnswersStorageKey,
  readStoredAnswers,
  writeStoredAnswers,
} from "@/features/portal/choreographies/create/answers-storage";
import type { CreateChoreographyRouteData } from "@/features/portal/choreographies/create/server";
import type { ChoreographyRegistrationBaseOptions } from "@/lib/events/bases.server";
import {
  applyRegistrationResolution,
  buildCreateChoreographyFormData,
  buildResolveChoreographyFormData,
  canAdvanceFromStep,
  clampCreateChoreographyStep,
  createChoreographySchema,
  createChoreographyStepSlugs,
  emptyCreateChoreographyValues,
  getCreateChoreographySteps,
  getOnlyOptionId,
  getSubmissionError,
  getSubmissionWarning,
  isAfterDancersStep,
  readCreateChoreographyStep,
  restoreCreateChoreographyAnswers,
  type CalculationActionData,
  type CreateActionData,
  type CreateChoreographyForm,
  type CreateChoreographyFormValues,
  type CreateChoreographyStep,
  type PortalResolvedRegistrationResolution,
} from "@/features/portal/choreographies/create/flow";
import {
  isUnexpectedActionError,
  type UnexpectedActionError,
} from "@/lib/shared/recoverable-client-action";

export type CreateChoreographyWizard = ReturnType<
  typeof useCreateChoreographyWizard
>;

export function useCreateChoreographyWizard(
  loaderData: CreateChoreographyRouteData,
) {
  const { eventId, registrationBaseOptions: baseOptions } = loaderData;
  const storageKey = getAnswersStorageKey(loaderData);
  const form = useForm<CreateChoreographyFormValues>({
    resolver: zodResolver(createChoreographySchema),
    defaultValues: getInitialValues(baseOptions),
  });
  const isRestored = useStoredAnswers({ form, loaderData, storageKey });
  const values = form.watch();
  const submodalities = getSubmodalitiesOf(baseOptions, values.modalityId);
  const canChooseSubmodality = submodalities.length > 0;
  const stepInUrl = useStepInUrl();
  const currentStep = stepInUrl.step;
  const registration = useRegistrationResolution({
    eventId,
    form,
    canChooseSubmodality,
    modalityName:
      baseOptions.modalities.find(
        (modality) => modality.id === values.modalityId,
      )?.name ?? null,
    onAccepted: (resolution) => {
      if (currentStep === "dancers") {
        stepInUrl.show(getStepAfterDancers(resolution));
      }
    },
  });
  const submission = useChoreographySubmission({
    eventId,
    form,
    canChooseSubmodality,
    storageKey,
  });
  const steps = getCreateChoreographySteps({
    resolution: registration.resolution,
  });
  const currentStepIndex = Math.max(0, steps.indexOf(currentStep));
  const isWaitingForResolution =
    isAfterDancersStep(currentStep) && registration.resolution === null;

  useStepGuard({
    canChooseSubmodality,
    isRestored,
    registration,
    stepInUrl,
    values,
  });

  function goNext() {
    if (currentStep === "dancers") {
      registration.resolve();
      return;
    }

    if (currentStep === "summary") {
      submission.confirm();
      return;
    }

    stepInUrl.show(steps[currentStepIndex + 1] ?? currentStep);
  }

  function goBack() {
    stepInUrl.show(steps[currentStepIndex - 1] ?? currentStep);
  }

  /** A modality comes with its only submodality, when it has just one. */
  function chooseModality() {
    form.setValue(
      "submodalityId",
      getOnlyOptionId(
        getSubmodalitiesOf(baseOptions, form.getValues("modalityId")),
      ),
      { shouldDirty: true },
    );
    registration.reset();
  }

  return {
    canAdvance: canAdvanceFromStep(currentStep, {
      canChooseSubmodality,
      resolution: registration.resolution,
      values,
    }),
    chooseModality,
    clearAnswers: () => clearStoredAnswers(storageKey),
    currentStep,
    currentStepIndex,
    form,
    goBack,
    goNext,
    goTo: stepInUrl.show,
    isLoadingStep: !isRestored || isWaitingForResolution,
    isResolving: registration.isResolving,
    refusal: registration.refusal,
    resetResolution: registration.reset,
    resolution: registration.resolution,
    steps,
    submission,
    submodalities,
    values,
  };
}

function getInitialValues(
  baseOptions: ChoreographyRegistrationBaseOptions,
): CreateChoreographyFormValues {
  const modalityId = getOnlyOptionId(baseOptions.modalities);

  return {
    ...emptyCreateChoreographyValues,
    modalityId,
    submodalityId: getOnlyOptionId(getSubmodalitiesOf(baseOptions, modalityId)),
  };
}

function getSubmodalitiesOf(
  baseOptions: ChoreographyRegistrationBaseOptions,
  modalityId: string,
) {
  return baseOptions.submodalities.filter(
    (submodality) => submodality.modalityId === modalityId,
  );
}

function getStepAfterDancers(resolution: PortalResolvedRegistrationResolution) {
  const steps = getCreateChoreographySteps({ resolution });

  return steps[steps.indexOf("dancers") + 1] ?? "professors";
}

/**
 * The step is `?paso=` in the URL, one history entry per step, so a reload
 * comes back to it and the phone's back gesture goes to the previous one.
 */
function useStepInUrl() {
  const [searchParams, setSearchParams] = useSearchParams();

  function show(
    step: CreateChoreographyStep,
    options: { replace?: boolean } = {},
  ) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);

        if (step === "choreography") {
          params.delete(stepParamName);
        } else {
          params.set(stepParamName, createChoreographyStepSlugs[step]);
        }

        return params;
      },
      { replace: options.replace },
    );
  }

  return {
    show,
    step: readCreateChoreographyStep(searchParams.get(stepParamName)),
  };
}

const stepParamName = "paso";

/**
 * Brings back the answers a reload of the tab kept, once, then keeps every
 * change. The restore waits for the browser because storage is not there on
 * the server: the page shows no step until it has run.
 */
function useStoredAnswers({
  form,
  loaderData,
  storageKey,
}: {
  form: CreateChoreographyForm;
  loaderData: CreateChoreographyRouteData;
  storageKey: string;
}) {
  const [isRestored, setIsRestored] = useState(false);
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    if (hasRestoredRef.current) {
      return;
    }

    hasRestoredRef.current = true;

    const restored = restoreCreateChoreographyAnswers(
      readStoredAnswers(storageKey),
      loaderData,
    );

    if (restored) {
      form.reset(restored);
    }

    setIsRestored(true);
  }, [form, loaderData, storageKey]);

  useEffect(() => {
    const subscription = form.watch((answers) =>
      writeStoredAnswers(storageKey, answers),
    );

    return () => subscription.unsubscribe();
  }, [form, storageKey]);

  return isRestored;
}

/**
 * Keeps the URL's step honest: it falls back to the first step whose answers
 * are incomplete, and a step after the dancers is shown only once the dancers
 * are resolved again, which a reload or the forward button can skip. A
 * refusal on the way sends the academy to the dancers, where it is shown.
 */
function useStepGuard({
  canChooseSubmodality,
  isRestored,
  registration,
  stepInUrl,
  values,
}: {
  canChooseSubmodality: boolean;
  isRestored: boolean;
  registration: ReturnType<typeof useRegistrationResolution>;
  stepInUrl: ReturnType<typeof useStepInUrl>;
  values: CreateChoreographyFormValues;
}) {
  const { step } = stepInUrl;

  useEffect(() => {
    if (
      !isRestored ||
      registration.isResolving ||
      registration.hasUnprocessedResult
    ) {
      return;
    }

    const target =
      registration.refusal && isAfterDancersStep(step)
        ? "dancers"
        : clampCreateChoreographyStep({
            canChooseSubmodality,
            resolution: registration.resolution,
            step,
            values,
          });

    if (target !== step) {
      stepInUrl.show(target, { replace: true });
      return;
    }

    if (isAfterDancersStep(step) && !registration.resolution) {
      registration.resolve();
    }
  });
}

/**
 * Asks the server which category the dancers put the choreography in. A refusal
 * stays on the dancers step as a notice, where the academy can fix the roster
 * or go back to the modality; an accepted resolution keeps the level and
 * schedule answers it still offers and hands over to the next step.
 */
function useRegistrationResolution({
  canChooseSubmodality,
  eventId,
  form,
  modalityName,
  onAccepted,
}: {
  canChooseSubmodality: boolean;
  eventId: string;
  form: CreateChoreographyForm;
  modalityName: string | null;
  onAccepted: (resolution: PortalResolvedRegistrationResolution) => void;
}) {
  const fetcher = useFetcher<CalculationActionData | UnexpectedActionError>();
  const [resolution, setResolution] =
    useState<PortalResolvedRegistrationResolution | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const processedDataRef = useRef<
    CalculationActionData | UnexpectedActionError | undefined
  >(undefined);
  // The effect below still has `resolution`/`refusal` from the render before
  // this result arrived, so a guard reading them in the same commit (see
  // useStepGuard) would resolve again on stale state; this flag tells it to
  // wait one more render.
  const hasUnprocessedResult =
    fetcher.data !== undefined && processedDataRef.current !== fetcher.data;

  useEffect(() => {
    const data = fetcher.data;

    if (!data || processedDataRef.current === data) {
      return;
    }

    processedDataRef.current = data;

    const outcome = isUnexpectedActionError(data)
      ? ({ status: "refused", message: data.message } as const)
      : applyRegistrationResolution({
          ...readResolutionAnswers(form),
          modalityName,
          result: data.result,
        });

    if (outcome.status === "refused") {
      setResolution(null);
      setRefusal(outcome.message);
      writeResolutionAnswers(form, {
        experienceLevelId: "",
        scheduleCapacityId: "",
      });
      return;
    }

    setResolution(outcome.resolution);
    setRefusal(null);
    writeResolutionAnswers(form, outcome);
    onAccepted(outcome.resolution);
  }, [fetcher.data, form, modalityName, onAccepted]);

  function resolve() {
    const values = form.getValues();

    setRefusal(null);
    void fetcher.submit(
      buildResolveChoreographyFormData({
        eventId,
        modalityId: values.modalityId,
        submodalityId: values.submodalityId ?? "",
        canChooseSubmodality,
        dancerIds: values.dancerIds,
      }),
      { method: "post" },
    );
  }

  /** Another modality or roster is another resolution: the old one goes. */
  function reset() {
    setResolution(null);
    setRefusal(null);
    writeResolutionAnswers(form, {
      experienceLevelId: "",
      scheduleCapacityId: "",
    });
  }

  return {
    hasUnprocessedResult,
    isResolving: fetcher.state !== "idle",
    refusal,
    reset,
    resolution,
    resolve,
  };
}

type ResolutionAnswers = {
  experienceLevelId: string;
  scheduleCapacityId: string;
};

function readResolutionAnswers(
  form: CreateChoreographyForm,
): ResolutionAnswers {
  return {
    experienceLevelId: form.getValues("experienceLevelId") ?? "",
    scheduleCapacityId: form.getValues("scheduleCapacityId") ?? "",
  };
}

function writeResolutionAnswers(
  form: CreateChoreographyForm,
  answers: ResolutionAnswers,
) {
  form.setValue("experienceLevelId", answers.experienceLevelId);
  form.setValue("scheduleCapacityId", answers.scheduleCapacityId);
}

/**
 * Saves the choreography. A saved one redirects the page to the list from the
 * action, so only a refusal or the duplicate warning comes back here.
 */
function useChoreographySubmission({
  canChooseSubmodality,
  eventId,
  form,
  storageKey,
}: {
  canChooseSubmodality: boolean;
  eventId: string;
  form: CreateChoreographyForm;
  storageKey: string;
}) {
  const fetcher = useFetcher<CreateActionData | UnexpectedActionError>();

  // The answers leave storage with the save, so a saved choreography does not
  // come back in the next registration; a refusal puts them back.
  useEffect(() => {
    if (fetcher.data) {
      writeStoredAnswers(storageKey, form.getValues());
    }
  }, [fetcher.data, form, storageKey]);

  function confirm(acknowledgedDuplicateIds: string[] = []) {
    const values = form.getValues();

    clearStoredAnswers(storageKey);

    void fetcher.submit(
      buildCreateChoreographyFormData({
        acknowledgedDuplicateIds,
        eventId,
        name: values.name,
        modalityId: values.modalityId,
        submodalityId: values.submodalityId ?? "",
        canChooseSubmodality,
        dancerIds: values.dancerIds,
        professorIds: values.professorIds,
        experienceLevelId: values.experienceLevelId ?? "",
        scheduleCapacityId: values.scheduleCapacityId ?? "",
      }),
      { method: "post" },
    );
  }

  // One object per server answer: the duplicate dialog reopens on a new
  // warning, so a re-render must not hand it a fresh one.
  const warning = useMemo(
    () => getSubmissionWarning(fetcher.data),
    [fetcher.data],
  );

  return {
    confirm,
    error: getSubmissionError(fetcher.data),
    isSubmitting: fetcher.state !== "idle",
    warning,
  };
}
