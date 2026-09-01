import { z } from "zod";

/**
 * Prose the orchestrator drops verbatim into a Markdown issue body.
 *
 * A model writing multi-paragraph prose into a JSON string sometimes escapes
 * its line breaks, emitting the two characters `\n` rather than a newline. JSON
 * carries newlines natively, so the escape is never what was meant — and
 * nothing downstream undoes it: `jq -r` emits the backslash faithfully and
 * `printf '%s'` passes it through, so it reaches the reader as visible `\n` in
 * the middle of a sentence. The prompt no longer asks for the escape; this
 * normalises it anyway, because the schema is the one choke point every
 * producer passes through.
 */
const issueProse = z
  .string()
  .min(1)
  .transform((value) => value.replaceAll("\\n", "\n"));

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
        whatToBuild: issueProse,
        // Not normalised: each criterion becomes one `- [ ]` bullet, so turning
        // an escape into a real newline here would break the list rather than
        // fix it.
        acceptanceCriteria: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
});

export type ToIssuesOutput = z.infer<typeof toIssuesSchema>;
