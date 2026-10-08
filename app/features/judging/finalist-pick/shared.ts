import { z } from "zod";

import { requiredFieldMessage } from "@/lib/shared/forms";

/** What the judge's list posts to save a `finalistPick`. */
export const saveFinalistPickIntent = "save-finalist-pick";

export const finalistPickSchema = z.object({
  academyId: z.string().trim().min(1, requiredFieldMessage),
  modalityId: z.string().min(1),
});

export type FinalistPickFormValues = z.input<typeof finalistPickSchema>;
