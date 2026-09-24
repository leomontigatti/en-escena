import { z } from "zod";

import { parseScoreValue, scoreValueMessage } from "@/lib/judging/score-value";

/**
 * The single-score form. An empty field and a bad one read the same message,
 * because to the judge they are the same mistake: the score they meant to give
 * is not in there yet. See app/lib/judging/score-value.ts for the rule itself.
 */
export const judgeScoreFormSchema = z.object({
  value: z
    .string()
    .refine((value) => parseScoreValue(value) !== null, scoreValueMessage()),
});

export type JudgeScoreFormValues = z.infer<typeof judgeScoreFormSchema>;
