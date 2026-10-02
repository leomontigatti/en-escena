import { z } from "zod";

import { criterionKinds } from "@/lib/judging/criteria";
import {
  validateSheetCriteria,
  type SheetRule,
} from "@/lib/judging/sheet-criteria";
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
  name: z.string(),
});

/**
 * One sheet's schema in the criteria editor. The rule itself lives in
 * `app/lib/judging/sheet-criteria.ts`, which the save asks too with the same
 * stored criteria, so the editor and the server refuse the same lists; all
 * that happens here is turning its field names back into form paths.
 */
export function buildSheetCriteriaFormSchema(rule: SheetRule) {
  return z
    .object({
      criteria: z.array(criterionFormSchema),
    })
    .superRefine((values, context) => {
      const validation = validateSheetCriteria(values.criteria, rule);

      if (validation.ok) {
        return;
      }

      for (const [fieldName, message] of Object.entries(
        validation.fieldErrors,
      )) {
        context.addIssue({
          code: "custom",
          message,
          path: toCriteriaFieldPath(fieldName),
        });
      }
    });
}

export type SheetCriteriaFormValues = z.infer<
  ReturnType<typeof buildSheetCriteriaFormSchema>
>;

function toCriteriaFieldPath(fieldName: string) {
  return fieldName
    .split(".")
    .map((segment) =>
      /^\d+$/.test(segment) ? Number.parseInt(segment, 10) : segment,
    );
}
