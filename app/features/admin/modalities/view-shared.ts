import { z } from "zod";

import { requiredFieldMessage } from "@/lib/shared/forms";

export const nameFormSchema = z.object({
  name: z.string().trim().min(1, requiredFieldMessage),
});

export const submodalityFormSchema = z.object({
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
