import { z } from "zod";

// Update-Branch structured output (spec §4.6): a single PR comment describing
// the merge. Tolerate the `body` alias, since models drift (§3.8).
export const updateBranchSchema = z
  .object({
    comment: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
  })
  .transform((raw, ctx) => {
    const comment = raw.comment ?? raw.body;
    if (!comment) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "output missing comment/body" });
    }
    return { comment: comment ?? "" };
  });

export type UpdateBranchOutput = z.infer<typeof updateBranchSchema>;
