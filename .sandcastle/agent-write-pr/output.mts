import { z } from "zod";

/** write-pr structured output (spec §4.2). The description must close the issue on merge. */
export function writePrSchema(issueNumber: string) {
  const closes = new RegExp(`closes\\s+#${issueNumber}\\b`, "i");
  return z.object({
    prTitle: z.string().min(1).max(256),
    prDescription: z
      .string()
      .min(1)
      .refine((body) => closes.test(body), {
        message: `prDescription must contain "Closes #${issueNumber}" so the PR closes the issue on merge.`,
      }),
  });
}

export type WritePrOutput = z.infer<ReturnType<typeof writePrSchema>>;
