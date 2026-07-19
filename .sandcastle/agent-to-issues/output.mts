import { z } from "zod";

/**
 * to-issues structured output (spec §4.1). A flat, ordered list of tracer-bullet
 * slices; the orchestrator creates and attaches each as a native sub-issue. List
 * order == execution order.
 */
export const toIssuesSchema = z.object({
  slices: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        whatToBuild: z.string().min(1),
        acceptanceCriteria: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
});

export type ToIssuesOutput = z.infer<typeof toIssuesSchema>;
