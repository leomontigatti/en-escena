import { z } from "zod";

import type { ProfessorListItem } from "@/lib/portal/professors.server";
import { requiredFieldMessage } from "@/lib/shared/forms";

export const updateProfessorIntent = "update-professor";
export const archiveProfessorIntent = "archive-professor";
export const reactivateProfessorIntent = "reactivate-professor";
export const professorNotFoundMessage = "No encontramos ese Profesor.";
export const professorDetailFormId = "portal-profesor-form";

export const professorSchema = z
  .object({
    firstName: z.string().trim().min(1, requiredFieldMessage),
    lastName: z.string().trim().min(1, requiredFieldMessage),
    documentType: z.string().trim(),
    documentNumber: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (!values.documentType && !values.documentNumber) {
      return;
    }

    if (!values.documentType) {
      context.addIssue({
        code: "custom",
        message: "Seleccioná el tipo de documento.",
        path: ["documentType"],
      });
    }

    if (!values.documentNumber) {
      context.addIssue({
        code: "custom",
        message: "Ingresá el número de documento.",
        path: ["documentNumber"],
      });
    }
  });

export type ProfessorFormValues = z.infer<typeof professorSchema>;
export type ProfessorFieldErrors = Partial<
  Record<keyof ProfessorFormValues, string>
>;
export type ProfessorStatusIntent =
  | typeof archiveProfessorIntent
  | typeof reactivateProfessorIntent;

export type PortalProfessorDetailLoaderData = {
  professor: ProfessorListItem;
};

export type PortalProfessorDetailActionData =
  | {
      status: "error";
      message: string;
      fieldErrors: ProfessorFieldErrors;
      values: ProfessorFormValues;
    }
  | {
      status: "success";
      message: string;
    }
  | undefined;
