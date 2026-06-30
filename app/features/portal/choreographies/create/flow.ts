import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";

import type { CreateChoreographyRegistrationResult } from "@/lib/choreographies/registration-confirmation.server";
import {
  choreographyNameMaxLength,
  hasChoreographyNameContent,
  invalidChoreographyNameMessage,
} from "@/lib/choreographies/choreography-name";
import type { ChoreographyRegistrationOperationResult } from "@/lib/choreographies/registration-resolution.server";
import { requiredFieldMessage } from "@/lib/shared/forms";

export const RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT =
  "resolve-choreography-registration";
export const CREATE_CHOREOGRAPHY_INTENT = "create-choreography";
export const CREATE_CHOREOGRAPHY_RESOLUTION_ERROR_TOAST_ID =
  "create-choreography-resolution-error";

export type RegistrationResolution = Extract<
  ChoreographyRegistrationOperationResult,
  { ok: true }
>["resolution"];

export type CalculationActionData = {
  intent: typeof RESOLVE_CHOREOGRAPHY_REGISTRATION_INTENT;
  result: ChoreographyRegistrationOperationResult;
};

export type CreateActionData = {
  intent: typeof CREATE_CHOREOGRAPHY_INTENT;
  result: Exclude<CreateChoreographyRegistrationResult, { ok: true }>;
};

export type CreateChoreographyStep =
  | "name"
  | "modality"
  | "submodality"
  | "dancers"
  | "experienceLevel"
  | "schedule"
  | "professors"
  | "summary";

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
  professorIds: z.array(z.string()),
  experienceLevelId: z.string().trim().optional(),
  scheduleCapacityId: z.string().trim().optional(),
});

export type CreateChoreographyFormValues = z.infer<
  typeof createChoreographySchema
>;
export type CreateChoreographyForm =
  UseFormReturn<CreateChoreographyFormValues>;
export type ManualRequiredFieldName =
  | "experienceLevelId"
  | "scheduleCapacityId"
  | "submodalityId";

export const emptyCreateChoreographyValues: CreateChoreographyFormValues = {
  name: "",
  modalityId: "",
  submodalityId: "",
  dancerIds: [],
  professorIds: [],
  experienceLevelId: "",
  scheduleCapacityId: "",
};

export function getCreateChoreographySteps(input: {
  canChooseSubmodality: boolean;
  resolution: RegistrationResolution | null;
}): CreateChoreographyStep[] {
  const steps: CreateChoreographyStep[] = ["name", "modality"];

  if (input.canChooseSubmodality) {
    steps.push("submodality");
  }

  steps.push("dancers");

  if (input.resolution?.experienceLevel.required) {
    steps.push("experienceLevel");
  }

  if (input.resolution?.schedule.status === "multiple") {
    steps.push("schedule");
  }

  steps.push("professors", "summary");

  return steps;
}

export function getFirstPostResolutionStepIndex(input: {
  canChooseSubmodality: boolean;
  resolution: RegistrationResolution;
}) {
  return getCreateChoreographySteps(input).findIndex(
    (step) =>
      step === "experienceLevel" ||
      step === "schedule" ||
      step === "professors",
  );
}

export function setRequiredFieldError(
  form: CreateChoreographyForm,
  fieldName: ManualRequiredFieldName,
) {
  form.setError(fieldName, {
    message: requiredFieldMessage,
    type: "manual",
  });
}

export function getSubmissionError(data: CreateActionData | undefined) {
  return data?.intent === CREATE_CHOREOGRAPHY_INTENT ? data.result.error : null;
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
  eventId: string;
  name: string;
  modalityId: string;
  submodalityId: string;
  canChooseSubmodality: boolean;
  dancerIds: string[];
  professorIds: string[];
  experienceLevelId: string;
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
  formData.set("scheduleCapacityId", input.scheduleCapacityId);

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
