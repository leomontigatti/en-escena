import { z } from "zod";

// Review structured output (spec §4.4) with the hard-won input tolerance of
// §3.8: models drift, so we accept aliases and coerce before validating. The
// orchestrator still drops hallucinated anchors/replies afterwards.

/** `path` or `file`; `body` or `comment`; single `line` int or a `lineRange` string. */
const inlineComment = z
  .object({
    path: z.string().min(1).optional(),
    file: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    comment: z.string().min(1).optional(),
    line: z.union([z.number(), z.string()]).optional(),
    lineRange: z.string().optional(),
    side: z.string().optional(),
  })
  .transform((raw, ctx) => {
    const path = raw.path ?? raw.file;
    const body = raw.body ?? raw.comment;
    // Leading integer of `line` or `lineRange` (e.g. "87-90" → 87).
    const rawLine = raw.line ?? raw.lineRange;
    const line =
      typeof rawLine === "number"
        ? Math.trunc(rawLine)
        : typeof rawLine === "string"
          ? Number.parseInt(rawLine, 10)
          : Number.NaN;

    if (!path) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "inline comment missing path/file" });
    }
    if (!body) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "inline comment missing body/comment" });
    }
    if (!Number.isInteger(line)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "inline comment missing a numeric line/lineRange" });
    }

    return {
      path: path ?? "",
      line,
      body: body ?? "",
      side: (raw.side ?? "RIGHT").toUpperCase() === "LEFT" ? "LEFT" : "RIGHT",
    };
  });

const reply = z.object({
  commentId: z.string().min(1),
  body: z.string().min(1),
});

/** Truthy/falsy however the model spelled it; `null` when it is not an answer. */
const SPEC_FINDINGS_WORDS: Record<string, boolean> = {
  true: true,
  yes: true,
  y: true,
  false: false,
  no: false,
  n: false,
  none: false,
};

function coerceSpecFindings(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return null;
  return SPEC_FINDINGS_WORDS[raw.trim().toLowerCase()] ?? null;
}

export const reviewSchema = z
  .object({
    summary: z.string().min(1),
    inlineComments: z.array(inlineComment).default([]),
    replies: z.array(reply).default([]),
    // Half of the outcome label (#1021): the reviewer reports spec findings
    // instead of fixing them, so a summary that carries one is a hand-off to a
    // human. `hasSpecFindings` is the alias the model drifts to. Unreadable or
    // absent stays `null` — unknown, never a `false` that would label the PR
    // `agent:ready` (see `outcome.mts`).
    specFindings: z.unknown().optional(),
    hasSpecFindings: z.unknown().optional(),
  })
  .transform(({ specFindings, hasSpecFindings, ...rest }) => ({
    ...rest,
    specFindings: coerceSpecFindings(specFindings ?? hasSpecFindings),
  }));

export type ReviewOutput = z.infer<typeof reviewSchema>;
export type ReviewInlineComment = ReviewOutput["inlineComments"][number];
export type ReviewReply = ReviewOutput["replies"][number];
