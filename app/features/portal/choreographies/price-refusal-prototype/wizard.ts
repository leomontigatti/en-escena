/**
 * THROWAWAY PROTOTYPE — the state every variant of ticket #623 shares.
 *
 * The real hook is `use-create-choreography-dialog.ts`; this one keeps only what
 * the refusal question needs (roster → group type → schedule → priced or not)
 * and drops the fetchers entirely.
 */
import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useForm, useWatch } from "react-hook-form";

import {
  emptyCreateChoreographyValues,
  formatGroupTypeLabel,
  type CreateChoreographyForm,
  type CreateChoreographyFormValues,
} from "../create/flow";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";

import {
  derivePrototypeGroupType,
  isPriced,
  precedingStepCount,
  prototypeCases,
  prototypeInitialDancerIds,
  type PrototypeCaseKey,
  type PrototypeGroupType,
  type PrototypeScheduleOption,
} from "./fixtures";

export type PrototypeStep = "dancers" | "schedule" | "professors" | "summary";

export type PrototypeWizard = {
  form: CreateChoreographyForm;
  groupType: PrototypeGroupType;
  groupTypeLabel: string;
  dancerCount: number;
  options: PrototypeScheduleOption[];
  scheduleStatus: "single" | "multiple";
  /** The lone option when `scheduleStatus === "single"`. */
  soleOption: PrototypeScheduleOption | null;
  selectedOption: PrototypeScheduleOption | null;
  /** No option at all can be priced, so the flow cannot leave `dancers`. */
  blockedAtDancers: boolean;
  /** The chosen option has no price row for the current group type. */
  blockedAtSchedule: boolean;
  /** The roster was submitted and the server refused: nothing can be priced. */
  resolutionRefused: boolean;
  dismissRefusal: () => void;
  blockedOption: PrototypeScheduleOption | null;
  steps: PrototypeStep[];
  currentStep: PrototypeStep;
  stepNumber: number;
  totalSteps: number;
  progressValue: number;
  canAdvance: boolean;
  goNext: () => void;
  goPrevious: () => void;
  selectSchedule: (id: string) => void;
};

export type PrototypeVariant = {
  key: string;
  name: string;
  Body: ComponentType<{ wizard: PrototypeWizard }>;
  /** Returns `null` to keep the shell's default "Siguiente" / "Guardar". */
  footer?: (wizard: PrototypeWizard) => ReactNode | null;
};

export function formatOptionLabel(option: PrototypeScheduleOption) {
  return formatScheduleDateTime(option.schedule, { includeName: true });
}

export function usePrototypeWizard(caseKey: PrototypeCaseKey): PrototypeWizard {
  const form: CreateChoreographyForm = useForm<CreateChoreographyFormValues>({
    defaultValues: {
      ...emptyCreateChoreographyValues,
      dancerIds: prototypeInitialDancerIds,
    },
  });

  const [stepIndex, setStepIndex] = useState(0);
  const [attemptedResolve, setAttemptedResolve] = useState(false);

  const dancerIds =
    useWatch({ control: form.control, name: "dancerIds" }) ?? [];
  const scheduleCapacityId =
    useWatch({ control: form.control, name: "scheduleCapacityId" }) ?? "";
  const professorIds =
    useWatch({ control: form.control, name: "professorIds" }) ?? [];

  const options = prototypeCases[caseKey].options;
  const groupType = derivePrototypeGroupType(dancerIds.length);
  const scheduleStatus = options.length > 1 ? "multiple" : "single";
  const soleOption = scheduleStatus === "single" ? (options[0] ?? null) : null;
  const selectedOption =
    options.find((option) => option.id === scheduleCapacityId) ?? null;

  const blockedAtDancers =
    dancerIds.length > 0 &&
    options.every((option) => !isPriced(option, groupType));
  const blockedAtSchedule =
    selectedOption !== null && !isPriced(selectedOption, groupType);
  const blockedOption =
    scheduleStatus === "single" ? soleOption : selectedOption;

  const steps = useMemo<PrototypeStep[]>(
    () =>
      scheduleStatus === "multiple"
        ? ["dancers", "schedule", "professors", "summary"]
        : ["dancers", "professors", "summary"],
    [scheduleStatus],
  );

  // Switching case can shorten the step list under a step index that is past its
  // end, and any roster change invalidates the chosen schedule.
  useEffect(() => {
    setStepIndex(0);
    setAttemptedResolve(false);
    form.setValue("scheduleCapacityId", "");
  }, [caseKey, form]);

  // Changing the roster invalidates the refusal: it has to be resolved again.
  const rosterKey = dancerIds.join(",");
  useEffect(() => {
    setAttemptedResolve(false);
  }, [rosterKey]);

  const currentStep = steps[Math.min(stepIndex, steps.length - 1)] ?? "dancers";

  // The refusal is a server fact, so it only exists once the academy pressed
  // "Siguiente" on the roster — never live while they are still picking dancers.
  const resolutionRefused =
    currentStep === "dancers" && attemptedResolve && blockedAtDancers;

  const canAdvance = (() => {
    if (currentStep === "dancers") {
      return dancerIds.length > 0 && !resolutionRefused;
    }
    if (currentStep === "schedule") {
      return selectedOption !== null && !blockedAtSchedule;
    }
    if (currentStep === "professors") {
      return professorIds.length > 0;
    }
    return true;
  })();

  const totalSteps = precedingStepCount + steps.length;
  const stepNumber = precedingStepCount + stepIndex + 1;

  function goNext() {
    if (currentStep === "dancers") {
      setAttemptedResolve(true);
      if (blockedAtDancers) {
        return;
      }
    }

    setStepIndex((index) => Math.min(index + 1, steps.length - 1));
  }

  return {
    resolutionRefused,
    dismissRefusal: () => setAttemptedResolve(false),
    form,
    groupType,
    groupTypeLabel: formatGroupTypeLabel(groupType),
    dancerCount: dancerIds.length,
    options,
    scheduleStatus,
    soleOption,
    selectedOption,
    blockedAtDancers,
    blockedAtSchedule,
    blockedOption,
    steps,
    currentStep,
    stepNumber,
    totalSteps,
    progressValue: Math.round((stepNumber / totalSteps) * 100),
    canAdvance,
    goNext,
    goPrevious: () => setStepIndex((index) => Math.max(index - 1, 0)),
    selectSchedule: (id: string) => form.setValue("scheduleCapacityId", id),
  };
}
