import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";

import type { ChoreographyRegistrationBaseOptions } from "@/lib/events/bases.server";

import type { CreateChoreographyRegistrationResult } from "@/lib/choreographies/registration-confirmation.server";
import {
  choreographyNameMaxLength,
  hasChoreographyNameContent,
  invalidChoreographyNameMessage,
} from "@/lib/choreographies/choreography-name";
import { getNoCompatibleCategoryRegistrationMessage } from "@/lib/choreographies/choreography-messages";
import type { ChoreographyRegistrationOperationResult } from "@/lib/choreographies/registration-resolution.server";
import { isEveryScheduleCapacityOptionFull } from "@/lib/choreographies/schedule-capacity-options";
import type { ChoreographyCastMatch } from "@/lib/choreographies/choreography-duplicates";
import { acknowledgedDuplicateIdsField } from "@/lib/shared/duplicate-warning";
import { requiredFieldMessage } from "@/lib/shared/forms";
import {
  isUnexpectedActionError,
  type UnexpectedActionError,
} from "@/lib/shared/recoverable-client-action";

export const RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT =
  "resolve-choreography-registration";
export const CREATE_CHOREOGRAPHY_INTENT = "create-choreography";

export const everyScheduleCapacityFullMessage =
  "Los cronogramas compatibles con esta coreografía ya no tienen lugar. Probá con otra modalidad o escribinos para que veamos alternativas.";

export type RegistrationResolution = Extract<
  ChoreographyRegistrationOperationResult,
  { ok: true }
>["resolution"];

/**
 * A resolution the wizard accepted: the category resolved. Registration refuses
 * a pending one on the server, so the steps after the resolution — and the
 * summary above all — never have to word a category that does not exist.
 */
export type PortalResolvedRegistrationResolution = RegistrationResolution & {
  category: Extract<RegistrationResolution["category"], { status: "resolved" }>;
};

export type CalculationActionData = {
  intent: typeof RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT;
  result: ChoreographyRegistrationOperationResult;
};

export type CreateActionData = {
  intent: typeof CREATE_CHOREOGRAPHY_INTENT;
  result: Exclude<CreateChoreographyRegistrationResult, { ok: true }>;
};

/**
 * The wizard's steps, in order. The single-field steps it started with are
 * merged: `choreography` asks the name, modality and submodality, and
 * `category` the experience level and schedule the resolution leaves open.
 */
export type CreateChoreographyStep =
  "choreography" | "dancers" | "category" | "professors" | "summary";

export const createChoreographySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, requiredFieldMessage)
    .refine(hasChoreographyNameContent, invalidChoreographyNameMessage)
    .max(
      choreographyNameMaxLength,
      "El nombre de la coreografía no puede superar los 120 caracteres.",
    ),
  modalityId: z.string().trim().min(1, requiredFieldMessage),
  submodalityId: z.string().trim().optional(),
  dancerIds: z.array(z.string()).min(1, requiredFieldMessage),
  professorIds: z.array(z.string()).min(1, requiredFieldMessage),
  experienceLevelId: z.string().trim().optional(),
  professionalEvaluation: z.boolean(),
  scheduleCapacityId: z.string().trim().optional(),
});

export type CreateChoreographyFormValues = z.infer<
  typeof createChoreographySchema
>;
export type CreateChoreographyForm =
  UseFormReturn<CreateChoreographyFormValues>;

export const emptyCreateChoreographyValues: CreateChoreographyFormValues = {
  name: "",
  modalityId: "",
  submodalityId: "",
  dancerIds: [],
  professorIds: [],
  experienceLevelId: "",
  professionalEvaluation: false,
  scheduleCapacityId: "",
};

/**
 * The category step exists only once a resolution leaves something to choose:
 * a required level, or more than one schedule. Before the dancers are resolved
 * it is counted as absent, so `Paso N de M` never promises a step that may not
 * come.
 */
export function getCreateChoreographySteps(input: {
  resolution: RegistrationResolution | null;
}): CreateChoreographyStep[] {
  return [
    "choreography",
    "dancers",
    ...(hasCategoryChoices(input.resolution) ? (["category"] as const) : []),
    "professors",
    "summary",
  ];
}

function hasCategoryChoices(resolution: RegistrationResolution | null) {
  return (
    resolution !== null &&
    (resolution.experienceLevel.required ||
      resolution.schedule.status === "multiple")
  );
}

/** The steps in the URL, as the academy reads them: `?paso=bailarines`. */
export const createChoreographyStepSlugs: Record<
  CreateChoreographyStep,
  string
> = {
  choreography: "coreografia",
  dancers: "bailarines",
  category: "categoria",
  professors: "profesores",
  summary: "resumen",
};

const everyCreateChoreographyStep = Object.keys(
  createChoreographyStepSlugs,
) as CreateChoreographyStep[];

export function readCreateChoreographyStep(
  slug: string | null,
): CreateChoreographyStep {
  return (
    everyCreateChoreographyStep.find(
      (step) => createChoreographyStepSlugs[step] === slug,
    ) ?? "choreography"
  );
}

/** Whether a step comes after the dancers, which is to say needs a resolution. */
export function isAfterDancersStep(step: CreateChoreographyStep) {
  return (
    everyCreateChoreographyStep.indexOf(step) >
    everyCreateChoreographyStep.indexOf("dancers")
  );
}

/**
 * The step a URL may show: the first one whose earlier answers are incomplete,
 * or the step itself. A category step the resolution does not have gives way
 * to the step after it.
 */
export function clampCreateChoreographyStep(input: {
  canChooseSubmodality: boolean;
  resolution: RegistrationResolution | null;
  step: CreateChoreographyStep;
  values: CreateChoreographyFormValues;
}): CreateChoreographyStep {
  const steps = getCreateChoreographySteps({ resolution: input.resolution });
  const target =
    everyCreateChoreographyStep
      .slice(everyCreateChoreographyStep.indexOf(input.step))
      .find((step) => steps.includes(step)) ?? "summary";

  return (
    steps
      .slice(0, steps.indexOf(target))
      .find((step) => !canAdvanceFromStep(step, input)) ?? target
  );
}

const storedAnswersSchema = z.object({
  name: z.string(),
  modalityId: z.string(),
  submodalityId: z.string().optional(),
  dancerIds: z.array(z.string()),
  professorIds: z.array(z.string()),
  experienceLevelId: z.string().optional(),
  // Answers stored before the switch existed have no entry: they did not ask.
  professionalEvaluation: z.boolean().optional(),
  scheduleCapacityId: z.string().optional(),
});

/**
 * The answers a reload brings back, against what the page offers now: a
 * dancer made inactive meanwhile, or a modality the event dropped, is gone.
 * The level and schedule are kept as they are; the resolution run on the way
 * back is what validates them.
 */
export function restoreCreateChoreographyAnswers(
  stored: unknown,
  options: {
    activeDancers: readonly { id: string }[];
    activeProfessors: readonly { id: string }[];
    registrationBaseOptions: ChoreographyRegistrationBaseOptions;
  },
): CreateChoreographyFormValues | null {
  const parsed = storedAnswersSchema.safeParse(stored);

  if (!parsed.success) {
    return null;
  }

  const answers = parsed.data;
  const { modalities, submodalities } = options.registrationBaseOptions;
  const modalityId = modalities.some((item) => item.id === answers.modalityId)
    ? answers.modalityId
    : "";
  const submodalityId = submodalities.some(
    (item) =>
      item.id === answers.submodalityId && item.modalityId === modalityId,
  )
    ? (answers.submodalityId ?? "")
    : "";

  return {
    name: answers.name,
    modalityId,
    submodalityId,
    dancerIds: keepOffered(answers.dancerIds, options.activeDancers),
    professorIds: keepOffered(answers.professorIds, options.activeProfessors),
    experienceLevelId: answers.experienceLevelId ?? "",
    professionalEvaluation: answers.professionalEvaluation ?? false,
    scheduleCapacityId: answers.scheduleCapacityId ?? "",
  };
}

function keepOffered(ids: string[], offered: readonly { id: string }[]) {
  return ids.filter((id) => offered.some((person) => person.id === id));
}

export function canAdvanceFromStep(
  step: CreateChoreographyStep,
  input: {
    canChooseSubmodality: boolean;
    resolution: RegistrationResolution | null;
    values: CreateChoreographyFormValues;
  },
) {
  const { values } = input;

  switch (step) {
    case "choreography":
      return (
        hasChoreographyNameContent(values.name) &&
        values.modalityId.length > 0 &&
        (!input.canChooseSubmodality || Boolean(values.submodalityId))
      );
    case "dancers":
      return values.dancerIds.length > 0;
    case "category":
      return canAdvanceFromCategoryStep(input.resolution, values);
    case "professors":
      return values.professorIds.length > 0;
    case "summary":
      return true;
  }
}

function canAdvanceFromCategoryStep(
  resolution: RegistrationResolution | null,
  values: CreateChoreographyFormValues,
) {
  if (!resolution) {
    return false;
  }

  const hasLevel =
    !resolution.experienceLevel.required || Boolean(values.experienceLevelId);

  return (
    hasLevel &&
    canAdvanceFromScheduleStep({
      resolution,
      selectedScheduleCapacityId: values.scheduleCapacityId ?? "",
    })
  );
}

/**
 * The value to choose for the academy when there is nothing to choose between:
 * a single modality, or a single submodality of the chosen one.
 */
export function getOnlyOptionId(options: readonly { id: string }[]) {
  return options.length === 1 ? (options[0]?.id ?? "") : "";
}

/**
 * With no capacity having room, the step replaces the select with the notice, so
 * there is nothing left to choose: the footer's action is disabled instead of
 * staying enabled with no effect.
 */
export function canAdvanceFromScheduleStep(input: {
  resolution: RegistrationResolution | null;
  selectedScheduleCapacityId: string;
}) {
  const { resolution, selectedScheduleCapacityId } = input;

  if (!resolution) {
    return false;
  }

  if (resolution.schedule.status === "auto") {
    return true;
  }

  if (resolution.schedule.status !== "multiple") {
    return false;
  }

  if (isEveryScheduleCapacityOptionFull(resolution.schedule.options)) {
    return false;
  }

  return selectedScheduleCapacityId.length > 0;
}

/**
 * The wizard's half of the server refusal: with no compatible category there is
 * nothing to register, so the resolution step keeps the academy where it can fix
 * it — on its dancers or its modality — instead of walking it to a summary the
 * confirmation would reject.
 */
export function resolvePortalRegistrationCategory(input: {
  resolution: RegistrationResolution;
  modalityName: string | null;
}):
  | { refused: true; message: string }
  | { refused: false; resolution: PortalResolvedRegistrationResolution } {
  const { category } = input.resolution;

  if (category.status !== "resolved") {
    return {
      refused: true,
      message: getNoCompatibleCategoryRegistrationMessage({
        modalityName: input.modalityName,
        groupType: input.resolution.groupType,
      }),
    };
  }

  return {
    refused: false,
    resolution: { ...input.resolution, category },
  };
}

export type RegistrationResolutionOutcome =
  | { status: "refused"; message: string }
  | {
      status: "resolved";
      resolution: PortalResolvedRegistrationResolution;
      experienceLevelId: string;
      scheduleCapacityId: string;
    };

/**
 * What the wizard makes of a resolution: either why it cannot go on, or the
 * accepted resolution with the level and schedule answers it still allows. A
 * level or schedule chosen against an earlier roster survives only while the new
 * resolution still offers it; the only schedule there is is taken for the
 * academy.
 */
export function applyRegistrationResolution(input: {
  experienceLevelId: string;
  modalityName: string | null;
  result: ChoreographyRegistrationOperationResult;
  scheduleCapacityId: string;
}): RegistrationResolutionOutcome {
  if (!input.result.ok) {
    return { status: "refused", message: input.result.error };
  }

  const category = resolvePortalRegistrationCategory({
    resolution: input.result.resolution,
    modalityName: input.modalityName,
  });

  if (category.refused) {
    return { status: "refused", message: category.message };
  }

  const { resolution } = category;

  if (resolution.schedule.status === "none") {
    return { status: "refused", message: resolution.schedule.error };
  }

  return {
    status: "resolved",
    resolution,
    experienceLevelId: keepOfferedExperienceLevel(
      resolution,
      input.experienceLevelId,
    ),
    scheduleCapacityId: keepOfferedScheduleCapacity(
      resolution,
      input.scheduleCapacityId,
    ),
  };
}

function keepOfferedExperienceLevel(
  resolution: RegistrationResolution,
  experienceLevelId: string,
) {
  const isOffered =
    resolution.experienceLevel.required &&
    resolution.experienceLevel.options.some(
      (option) => option.id === experienceLevelId,
    );

  return isOffered ? experienceLevelId : "";
}

function keepOfferedScheduleCapacity(
  resolution: RegistrationResolution,
  scheduleCapacityId: string,
) {
  if (resolution.schedule.status === "auto") {
    return resolution.schedule.scheduleCapacityId;
  }

  const isOffered = resolution.schedule.options.some(
    (option) => option.id === scheduleCapacityId,
  );

  return isOffered ? scheduleCapacityId : "";
}

/**
 * The wizard stays open while there is an error to show, so an unexpected
 * failure — which `recoverableClientAction` returns as a generic error result —
 * has to surface here too. Otherwise the dialog reads it as a success and
 * closes over every step the academy filled in.
 */
export function getSubmissionError(
  data: CreateActionData | UnexpectedActionError | undefined,
) {
  if (isUnexpectedActionError(data)) {
    return data.message;
  }

  if (data?.intent !== CREATE_CHOREOGRAPHY_INTENT) {
    return null;
  }

  // The duplicate refusal is the one the academy is allowed to overrule, so it
  // is read as a warning instead — an error notice next to a continue action
  // would say the opposite of what the action does.
  return getDuplicateWarning(data.result) ? null : data.result.error;
}

export type CreateChoreographyDuplicateWarning = {
  matchIds: string[];
  matches: ChoreographyCastMatch[];
};

export function getSubmissionWarning(
  data: CreateActionData | UnexpectedActionError | undefined,
): CreateChoreographyDuplicateWarning | null {
  if (
    isUnexpectedActionError(data) ||
    data?.intent !== CREATE_CHOREOGRAPHY_INTENT
  ) {
    return null;
  }

  const warning = getDuplicateWarning(data.result);

  if (!warning) {
    return null;
  }

  return {
    matchIds: warning.matches.map((match) => match.id),
    matches: warning.matches,
  };
}

function getDuplicateWarning(result: CreateActionData["result"]) {
  return result.code === "duplicate-choreography" ? result.warning : null;
}

export function formatGroupTypeLabel(
  groupType: RegistrationResolution["groupType"] | string,
) {
  switch (groupType) {
    case "solo":
      return "Solo";
    case "duo":
      return "Dúo";
    case "trio":
      return "Trío";
    default:
      return "Grupal";
  }
}

export function buildResolveChoreographyFormData(input: {
  eventId: string;
  modalityId: string;
  submodalityId: string;
  canChooseSubmodality: boolean;
  dancerIds: string[];
}) {
  const formData = new FormData();
  formData.set("intent", RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT);
  formData.set("eventId", input.eventId);
  formData.set("modalityId", input.modalityId);
  setOptionalFormString(
    formData,
    "submodalityId",
    input.canChooseSubmodality ? input.submodalityId : "",
  );
  appendFormStringArray(formData, "dancerIds", input.dancerIds);

  return formData;
}

export function buildCreateChoreographyFormData(input: {
  acknowledgedDuplicateIds?: string[];
  eventId: string;
  name: string;
  modalityId: string;
  submodalityId: string;
  canChooseSubmodality: boolean;
  dancerIds: string[];
  professorIds: string[];
  experienceLevelId: string;
  professionalEvaluation: boolean;
  scheduleCapacityId: string;
}) {
  const formData = new FormData();
  formData.set("intent", CREATE_CHOREOGRAPHY_INTENT);
  formData.set("eventId", input.eventId);
  formData.set("name", input.name);
  formData.set("modalityId", input.modalityId);
  setOptionalFormString(
    formData,
    "submodalityId",
    input.canChooseSubmodality ? input.submodalityId : "",
  );
  appendFormStringArray(formData, "dancerIds", input.dancerIds);
  appendFormStringArray(formData, "professorIds", input.professorIds);
  setOptionalFormString(formData, "experienceLevelId", input.experienceLevelId);
  // Sent only when asked, as a checkbox would be: absent reads as `false`.
  if (input.professionalEvaluation) {
    formData.set("professionalEvaluation", "true");
  }
  formData.set("scheduleCapacityId", input.scheduleCapacityId);
  appendFormStringArray(
    formData,
    acknowledgedDuplicateIdsField,
    input.acknowledgedDuplicateIds ?? [],
  );

  return formData;
}

function setOptionalFormString(formData: FormData, key: string, value: string) {
  if (value) {
    formData.set(key, value);
  }
}

function appendFormStringArray(
  formData: FormData,
  key: string,
  values: string[],
) {
  for (const value of values) {
    formData.append(key, value);
  }
}
