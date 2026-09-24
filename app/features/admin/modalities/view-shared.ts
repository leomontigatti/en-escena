import { z } from "zod";

import {
  criterionKinds,
  duplicateCriterionNameErrors,
  validateCriteriaMaxima,
} from "@/lib/judging/criteria";
import { requiredFieldMessage } from "@/lib/shared/forms";

const nameFormSchema = z.object({
  name: z.string().trim().min(1, requiredFieldMessage),
});

const submodalityFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, requiredFieldMessage),
});

export const modalityFormSchema = nameFormSchema
  .extend({
    submodalities: z.array(submodalityFormSchema),
  })
  .superRefine((values, context) => {
    const firstIndexByName = new Map<string, number>();

    values.submodalities.forEach((submodality, index) => {
      const normalizedName = submodality.name.trim().toLowerCase();

      if (!normalizedName) {
        return;
      }

      const firstIndex = firstIndexByName.get(normalizedName);

      if (firstIndex === undefined) {
        firstIndexByName.set(normalizedName, index);
        return;
      }

      context.addIssue({
        code: "custom",
        message: "Revisá el nombre de la submodalidad.",
        path: ["submodalities", firstIndex, "name"],
      });
      context.addIssue({
        code: "custom",
        message: "Ya existe una submodalidad con ese nombre.",
        path: ["submodalities", index, "name"],
      });
    });
  });

export type ModalityFormValues = z.infer<typeof modalityFormSchema>;

const criterionFormSchema = z.object({
  kind: z.enum(criterionKinds),
  maximum: z.string(),
  name: z.string().trim().min(1, requiredFieldMessage),
});

/**
 * The criteria dialog's schema. The sheet rule itself lives in
 * `app/lib/judging/criteria.ts`, which the save asks too, so the dialog and the
 * server refuse the same lists; all that happens here is turning its field names
 * back into form paths.
 */
export const submodalityCriteriaFormSchema = z
  .object({
    criteria: z.array(criterionFormSchema),
  })
  .superRefine((values, context) => {
    const duplicates = duplicateCriterionNameErrors(
      values.criteria.map((criterion) => criterion.name),
    );

    for (const [index, message] of duplicates) {
      context.addIssue({
        code: "custom",
        message,
        path: ["criteria", index, "name"],
      });
    }

    const maximaValidation = validateCriteriaMaxima(values.criteria);

    if (maximaValidation.ok) {
      return;
    }

    for (const [fieldName, message] of Object.entries(
      maximaValidation.fieldErrors,
    )) {
      context.addIssue({
        code: "custom",
        message,
        path: toCriteriaFieldPath(fieldName),
      });
    }
  });

export type SubmodalityCriteriaFormValues = z.infer<
  typeof submodalityCriteriaFormSchema
>;

function toCriteriaFieldPath(fieldName: string) {
  return fieldName
    .split(".")
    .map((segment) =>
      /^\d+$/.test(segment) ? Number.parseInt(segment, 10) : segment,
    );
}
