import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import codePlugin from "./oxlint-code-plugin.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const oxlintBin = path.join(repoRoot, "node_modules", ".bin", "oxlint");
const pluginPath = path.join(repoRoot, "scripts", "oxlint-code-plugin.mjs");

const violatingFixture = `
export function parse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function load(read: () => string) {
  try {
    return read();
  } catch (error) {}
}
`;

const compliantFixture = `
export function parseHeader(bytes: Uint8Array, decode: (b: Uint8Array) => string) {
  try {
    return decode(bytes);
  } catch {
    // A header the decoder cannot read is the user's file: it becomes the
    // refusal, never an exception.
    return null;
  }
}

export function describe(error: unknown) {
  // The report must not throw while describing what was thrown.
  try {
    return String(error);
  } catch {
    return "unprintable";
  }
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    throw new Error("Not a valid URL.");
  }
}

export function load(read: () => string, log: (error: unknown) => void) {
  try {
    return read();
  } catch (error) {
    log(error);
    return "";
  }
}
`;

type Diagnostic = {
  code: string;
  message: string;
  labels: { span: { line: number } }[];
};

function lint(directory: string, file: string) {
  const result = spawnSync(
    oxlintBin,
    ["-c", ".oxlintrc.json", "--format", "json", file],
    { cwd: directory, encoding: "utf8" },
  );
  const output = JSON.parse(result.stdout) as { diagnostics: Diagnostic[] };
  return output.diagnostics
    .map((diagnostic) => ({
      rule: diagnostic.code,
      line: diagnostic.labels[0]?.span.line ?? 0,
      message: diagnostic.message,
    }))
    .sort((left, right) => left.line - right.line);
}

describe("code oxlint plugin", () => {
  let tempRoot: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "oxlint-code-plugin-"));
    await mkdir(path.join(tempRoot, "app"), { recursive: true });
    await writeFile(
      path.join(tempRoot, ".oxlintrc.json"),
      JSON.stringify({
        categories: { correctness: "off" },
        plugins: [],
        jsPlugins: [pluginPath],
        rules: { "code/catch-reason": "error" },
      }),
    );
    await writeFile(
      path.join(tempRoot, "app", "violating.ts"),
      violatingFixture,
    );
    await writeFile(
      path.join(tempRoot, "app", "compliant.ts"),
      compliantFixture,
    );
  });

  afterAll(async () => {
    await rm(tempRoot, { force: true, recursive: true });
  });

  test("flags a catch that drops what it caught without saying why", () => {
    expect(lint(tempRoot, "app/violating.ts")).toEqual([
      {
        rule: "code(catch-reason)",
        line: 5,
        message: expect.stringContaining("one-line reason"),
      },
      {
        rule: "code(catch-reason)",
        line: 13,
        message: expect.stringContaining("one-line reason"),
      },
    ]);
  });

  test("stays silent on a catch with its reason inside or above the try, one that throws, and one that uses what it caught", () => {
    expect(lint(tempRoot, "app/compliant.ts")).toEqual([]);
  });

  test("the repo config enables every rule the plugin defines", async () => {
    const config = JSON.parse(
      await readFile(path.join(repoRoot, ".oxlintrc.json"), "utf8"),
    ) as { overrides: { rules: Record<string, string> }[] };
    const enabled = config.overrides.flatMap((override) =>
      Object.entries(override.rules)
        .filter(
          ([rule, level]) => rule.startsWith("code/") && level === "error",
        )
        .map(([rule]) => rule),
    );

    expect(enabled.sort()).toEqual(
      Object.keys(codePlugin.rules)
        .map((rule) => `code/${rule}`)
        .sort(),
    );
  });
});
