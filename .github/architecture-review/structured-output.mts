// Read the structured output an agent turn emitted: the last `<tag>…</tag>`
// block in its text, parsed as JSON and validated against a zod schema.

import type { z } from "zod";

/** Why a turn's output could not be used, with what the agent emitted, for the retry. */
export class StructuredOutputError extends Error {
  constructor(
    message: string,
    readonly tag: string,
    /** The block's content; `undefined` when no block was emitted at all. */
    readonly rawMatched: string | undefined,
    /** The session that emitted it, so a retry can resume it. */
    readonly sessionId: string | undefined,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "StructuredOutputError";
  }
}

function findLastTagContent(text: string, tag: string): string | undefined {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const end = text.lastIndexOf(close);
  if (end === -1) return undefined;
  const start = text.lastIndexOf(open, end);
  if (start === -1) return undefined;
  return text.slice(start + open.length, end);
}

/** Models often fence the JSON inside the tag; the fence is not part of it. */
function unwrapFences(raw: string): string {
  const fenced = /^```[a-z]*\n([\s\S]*?)\n?```$/.exec(raw);
  return fenced ? fenced[1] : raw;
}

export function extractStructuredOutput<T>(
  text: string,
  tag: string,
  schema: z.ZodType<T>,
  sessionId: string | undefined,
): T {
  const raw = findLastTagContent(text, tag);
  if (raw === undefined) {
    throw new StructuredOutputError(
      `Structured output tag <${tag}> not found in agent output`,
      tag,
      undefined,
      sessionId,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapFences(raw.trim()));
  } catch (cause) {
    throw new StructuredOutputError(
      `Structured output tag <${tag}> contains invalid JSON`,
      tag,
      raw,
      sessionId,
      { cause },
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new StructuredOutputError(
      `Structured output tag <${tag}> failed schema validation`,
      tag,
      raw,
      sessionId,
      { cause: result.error },
    );
  }
  return result.data;
}
