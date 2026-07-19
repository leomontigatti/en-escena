import { z } from "zod";

// Architecture-review structured output (spec §4.8): a discriminated union on
// `status`. Either a fully-specified PRD to publish, or a skip with a reason.

const proposed = z.object({
  status: z.literal("proposed"),
  title: z.string().min(1).max(256),
  body: z.string().min(1),
  oneLineSummary: z.string().min(1),
  candidatesConsidered: z.array(z.string().min(1)).min(1),
});

const skipped = z.object({
  status: z.literal("skipped"),
  reason: z.string().min(1),
});

export const architectureReviewSchema = z.discriminatedUnion("status", [proposed, skipped]);

export type ArchitectureReviewOutput = z.infer<typeof architectureReviewSchema>;
