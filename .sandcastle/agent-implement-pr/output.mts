import { z } from "zod";

// Implement-PR structured output (spec §4.5) with the §3.8 input tolerance:
// models drift, so we accept aliases and coerce before validating. The
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
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "inline comment missing a numeric line/lineRange",
      });
    }

    return {
      path: path ?? "",
      line,
      body: body ?? "",
      side: (raw.side ?? "RIGHT").toUpperCase() === "LEFT" ? "LEFT" : "RIGHT",
    };
  });

/** `body` or `comment`. */
const topLevelComment = z
  .object({
    body: z.string().min(1).optional(),
    comment: z.string().min(1).optional(),
  })
  .transform((raw, ctx) => {
    const body = raw.body ?? raw.comment;
    if (!body) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "top-level comment missing body/comment" });
    }
    return { body: body ?? "" };
  });

const threadReply = z.object({
  commentId: z.string().min(1),
  body: z.string().min(1),
});

export const implementPrSchema = z.object({
  threadReplies: z.array(threadReply).default([]),
  newInlineComments: z.array(inlineComment).default([]),
  topLevelComments: z.array(topLevelComment).default([]),
});

export type ImplementPrOutput = z.infer<typeof implementPrSchema>;
