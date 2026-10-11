import { createHash } from "node:crypto";

type UnexpectedErrorSource = "server" | "client";

// A V8 frame (`    at fn (file:1:2)`) or a Firefox and Safari one (`fn@url:1:2`).
const FRAME = /^\s+at\s|@\S+:\d+:\d+$/;

/**
 * The stable name of one bug: its source, route pattern, normalised message
 * and top application frame, hashed. What varies between two occurrences of
 * the same bug is left out: ids and numbers in the message, and the line,
 * column, bundle hash and origin of the frame, which change with each release.
 */
function signUnexpectedError({
  source,
  route,
  stack,
}: {
  source: UnexpectedErrorSource;
  route: string;
  stack: string;
}): string {
  const key = [
    source,
    route,
    normalizeMessage(readHeadline(stack)),
    normalizeFrame(readTopAppFrame(stack)),
  ].join("\n");

  return createHash("sha256").update(key).digest("hex");
}

/** The stack's first line: `Name: message`. */
function readHeadline(stack: string) {
  return stack.split("\n", 1)[0] ?? "";
}

function normalizeMessage(headline: string) {
  return headline
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "<id>",
    )
    .replace(/\d+/g, "<n>")
    .slice(0, 300);
}

function readTopAppFrame(stack: string) {
  const frames = stack.split("\n").filter((line) => FRAME.test(line));

  return (
    frames.find(
      (frame) => !frame.includes("node_modules") && !frame.includes("node:"),
    ) ?? ""
  );
}

function normalizeFrame(frame: string) {
  return frame
    .trim()
    .replace(/https?:\/\/[^/\s)]+/g, "")
    .replace(/-[\w-]{8}\.(m?js)/g, ".$1")
    .replace(/(:\d+)+(?=\)?$)/, "");
}

export { readHeadline, signUnexpectedError };
export type { UnexpectedErrorSource };
