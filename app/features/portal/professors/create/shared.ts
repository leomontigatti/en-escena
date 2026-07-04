import { z } from "zod";

import { requiredFieldMessage } from "@/lib/shared/forms";

export const createProfessorIntent = "create-professor";

export const createProfessorSchema = z.object({
  firstName: z.string().trim().min(1, requiredFieldMessage),
  lastName: z.string().trim().min(1, requiredFieldMessage),
});

export type CreateProfessorFormValues = z.infer<typeof createProfessorSchema>;

export const emptyProfessorValues: CreateProfessorFormValues = {
  firstName: "",
  lastName: "",
};

export type CreateProfessorActionData =
  | {
      status: "error";
      fieldErrors: Partial<Record<keyof CreateProfessorFormValues, string>>;
      values: CreateProfessorFormValues;
      modalOpen: boolean;
    }
  | undefined;
