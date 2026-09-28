import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import type { ChoreographyRegistrationBaseOptions } from "@/lib/events/bases.server";
import {
  applyRegistrationResolution,
  buildCreateChoreographyFormData,
  buildResolveChoreographyFormData,
  canAdvanceFromStep,
  createChoreographySchema,
  emptyCreateChoreographyValues,
  getCreateChoreographySteps,
  getOnlyOptionId,
  getSubmissionError,
  getSubmissionWarning,
  type CalculationActionData,
  type CreateActionData,
  type CreateChoreographyForm,
  type CreateChoreographyFormValues,
  type CreateChoreographyStep,
  type PortalResolvedRegistrationResolution,
} from "@/features/portal/choreographies/create/flow";
import type { UnexpectedActionError } from "@/lib/shared/recoverable-client-action";

export type CreateChoreographyWizard = ReturnType<
  typeof useCreateChoreographyWizard
>;

export function useCreateChoreographyWizard({
  baseOptions,
  eventId,
}: {
  baseOptions: ChoreographyRegistrationBaseOptions;
  eventId: string;
}) {
  const form = useForm<CreateChoreographyFormValues>({
    resolver: zodResolver(createChoreographySchema),
    defaultValues: getInitialValues(baseOptions),
  });
  const values = form.watch();
  const submodalities = getSubmodalitiesOf(baseOptions, values.modalityId);
  const canChooseSubmodality = submodalities.length > 0;
  const [currentStep, setCurrentStep] =
    useState<CreateChoreographyStep>("choreography");
  const registration = useRegistrationResolution({
    eventId,
    form,
    canChooseSubmodality,
    modalityName:
      baseOptions.modalities.find(
        (modality) => modality.id === values.modalityId,
      )?.name ?? null,
    onAccepted: (resolution) => setCurrentStep(getStepAfterDancers(resolution)),
  });
  const submission = useChoreographySubmission({
    eventId,
    form,
    canChooseSubmodality,
  });
  const steps = getCreateChoreographySteps({
    resolution: registration.resolution,
  });
  const currentStepIndex = Math.max(0, steps.indexOf(currentStep));

  function goNext() {
    if (currentStep === "dancers") {
      registration.resolve();
      return;
    }

    if (currentStep === "summary") {
      submission.confirm();
      return;
    }

    setCurrentStep(steps[currentStepIndex + 1] ?? currentStep);
  }

  function goBack() {
    setCurrentStep(steps[currentStepIndex - 1] ?? currentStep);
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
    currentStep,
    currentStepIndex,
    form,
    goBack,
    goNext,
    goTo: setCurrentStep,
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
  const fetcher = useFetcher<CalculationActionData>();
  const [resolution, setResolution] =
    useState<PortalResolvedRegistrationResolution | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const processedDataRef = useRef<CalculationActionData | undefined>(undefined);

  useEffect(() => {
    const data = fetcher.data;

    if (!data || processedDataRef.current === data) {
      return;
    }

    processedDataRef.current = data;

    const outcome = applyRegistrationResolution({
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
}: {
  canChooseSubmodality: boolean;
  eventId: string;
  form: CreateChoreographyForm;
}) {
  const fetcher = useFetcher<CreateActionData | UnexpectedActionError>();

  function confirm(acknowledgedDuplicateIds: string[] = []) {
    const values = form.getValues();

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

  return {
    confirm,
    error: getSubmissionError(fetcher.data),
    isSubmitting: fetcher.state !== "idle",
    warning: getSubmissionWarning(fetcher.data),
  };
}
