import { z } from "zod";

import { buildBirthDateRefinement } from "@/lib/dancers/birth-date";
import { requiredFieldMessage } from "@/lib/shared/forms";

export const createDancerIntent = "create-dancer";

export function buildCreateDancerSchema(eventStartDate: string | null) {
  return z.object({
    firstName: z.string().trim().min(1, requiredFieldMessage),
    lastName: z.string().trim().min(1, requiredFieldMessage),
    birthDate: z
      .string()
      .trim()
      .min(1, requiredFieldMessage)
      .superRefine(buildBirthDateRefinement(eventStartDate)),
  });
}

export type CreateDancerFormValues = z.infer<
  ReturnType<typeof buildCreateDancerSchema>
>;

export const emptyDancerValues: CreateDancerFormValues = {
  firstName: "",
  lastName: "",
  birthDate: "",
};

export type CreateDancerActionData =
  | {
      status: "success";
      message: string;
    }
  | {
      status: "error";
      fieldErrors: Partial<Record<keyof CreateDancerFormValues, string>>;
      values: CreateDancerFormValues;
      modalOpen: boolean;
    }
  | undefined;
