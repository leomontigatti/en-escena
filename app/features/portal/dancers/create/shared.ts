import { z } from "zod";

import { requiredFieldMessage } from "@/lib/shared/forms";

export const createDancerIntent = "create-dancer";

export const createDancerSchema = z.object({
  firstName: z.string().trim().min(1, requiredFieldMessage),
  lastName: z.string().trim().min(1, requiredFieldMessage),
  birthDate: z.string().trim().min(1, requiredFieldMessage),
});

export type CreateDancerFormValues = z.infer<typeof createDancerSchema>;

export const emptyDancerValues: CreateDancerFormValues = {
  firstName: "",
  lastName: "",
  birthDate: "",
};

export const emptyDancerFieldErrors: Partial<
  Record<keyof CreateDancerFormValues, string>
> = {};

export type CreateDancerActionData =
  | {
      status: "error";
      fieldErrors: Partial<Record<keyof CreateDancerFormValues, string>>;
      values: CreateDancerFormValues;
      modalOpen: boolean;
    }
  | undefined;
