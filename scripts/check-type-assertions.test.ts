import { describe, expect, test } from "vitest";

import {
  findDisableComments,
  type RatchetInput,
  ratchetProblems,
  ruleName,
} from "./check-type-assertions";

const allowlist = { "app/a.ts": 2, "app/b.ts": 1 };

const exempting = (files: string[]) => ({
  files,
  rules: { [ruleName]: "off" },
});

// A tree that matches its allowlist, master's list and the lint override.
const matching: RatchetInput = {
  counts: { "app/a.ts": 2, "app/b.ts": 1 },
  allowlist,
  base: { state: "read", list: allowlist },
  overrides: [
    { files: ["app/**/*.tsx"], rules: { "ui/no-restyle": "error" } },
    exempting(["app/a.ts", "app/b.ts"]),
  ],
  disableComments: [],
};

const problems = (change: Partial<RatchetInput>) =>
  ratchetProblems({ ...matching, ...change });

// Built in parts, so this file holds no disable comment the check would find.
const disable = (kind: string) => `// ${["oxlint", kind].join("-")}`;
const eslintDisable = ["eslint", "disable"].join("-");

describe("the type assertion ratchet", () => {
  test("passes a tree whose counts, base and override all match the allowlist", () => {
    expect(problems({})).toEqual([]);
  });

  test("fails a file with more assertions than its entry, naming both counts", () => {
    const found = problems({
      counts: { ...matching.counts, "app/a.ts": 3, "app/c.ts": 1 },
    });

    expect(found).toHaveLength(2);
    expect(found[0]).toMatch(/app\/a\.ts.*3.*2/);
    expect(found[1]).toMatch(/app\/c\.ts.*1.*0/);
  });

  test("fails a file with fewer assertions than its entry, and says how to lower it", () => {
    const found = problems({ counts: { "app/a.ts": 1 } });

    expect(found).toHaveLength(2);
    expect(found[0]).toMatch(/app\/a\.ts.*1.*2/);
    expect(found[1]).toMatch(/app\/b\.ts.*0.*1/);
    expect(found.every((problem) => problem.includes("--write"))).toBe(true);
  });

  test("fails an entry that master's list does not hold, or holds lower", () => {
    const grown = { "app/a.ts": 3, "app/b.ts": 1, "app/c.ts": 1 };
    const found = problems({
      allowlist: grown,
      counts: grown,
      overrides: [exempting(Object.keys(grown))],
    });

    expect(found).toHaveLength(2);
    expect(found[0]).toMatch(/app\/a\.ts.*3.*origin\/master.*2/);
    expect(found[1]).toMatch(/app\/c\.ts.*origin\/master/);
  });

  test("fails closed when master's list cannot be read, and says how to fetch it", () => {
    const found = problems({
      base: { state: "unreadable", detail: "unknown revision" },
    });

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("git fetch origin master");
  });

  test("starts the ratchet when master has no list yet", () => {
    expect(problems({ base: { state: "absent" } })).toEqual([]);
  });

  test("fails an override that turns the rule off for a file the list does not hold", () => {
    const found = problems({
      overrides: [
        ...matching.overrides,
        exempting(["app/c.ts"]),
        { files: ["tests/**"], rules: { [ruleName]: "warn" } },
      ],
    });

    expect(found).toHaveLength(2);
    expect(found[0]).toContain("app/c.ts");
    expect(found[1]).toContain("tests/**");
  });

  test("fails a listed file the override does not exempt", () => {
    const found = problems({ overrides: [exempting(["app/a.ts"])] });

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("app/b.ts");
  });

  test("fails a disable comment, at its file and line", () => {
    const found = problems({
      disableComments: [{ file: "app/a.ts", line: 12 }],
    });

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("app/a.ts:12");
  });
});

describe("disable comments", () => {
  test("finds a next-line or block directive that names the rule, and a line or block one that names none", () => {
    const source = [
      `${disable("disable-next-line")} ${ruleName} -- a reason`,
      "const a = 1;",
      `/* ${eslintDisable} @typescript-eslint/consistent-type-assertions */`,
      `${disable("disable-line")}`,
      `/* ${eslintDisable} */`,
    ].join("\n");

    expect(findDisableComments(source, "probe.ts")).toEqual([1, 3, 4, 5]);
  });

  test("finds a block comment that names the rule on a later line", () => {
    const source = [
      "const a = 1;",
      `/* ${eslintDisable} no-debugger,`,
      `   ${ruleName} */`,
      "const b = 2;",
    ].join("\n");

    expect(findDisableComments(source, "probe.ts")).toEqual([2]);
  });

  test("passes a block comment that names only other rules over several lines", () => {
    const source = [
      `/* ${eslintDisable} no-debugger,`,
      "   no-console */",
      `const rule = "${ruleName}";`,
    ].join("\n");

    expect(findDisableComments(source, "probe.ts")).toEqual([]);
  });

  test("reads a line comment after a glob as its own line, not a block comment", () => {
    const source = [
      `const glob = "scripts/**"; ${["// eslint", "disable-next-line"].join("-")}`,
      "const a = 1;",
      `const glob2 = "scripts/**"; ${["// eslint", "disable-line"].join("-")} no-debugger`,
      `const rule = "${ruleName}";`,
    ].join("\n");

    expect(findDisableComments(source, "probe.ts")).toEqual([1]);
  });

  test("finds a directive that starts on the line after its block comment opens", () => {
    const source = [
      "/*",
      `   ${eslintDisable} no-debugger,`,
      `   ${ruleName}`,
      " */",
      "const a = 1;",
    ].join("\n");

    expect(findDisableComments(source, "probe.ts")).toEqual([2]);
  });

  test("reads a block comment's rules only up to its end, not the code after it", () => {
    const source = `/* ${eslintDisable} no-debugger */ const rule = "${ruleName}";`;

    expect(findDisableComments(source, "probe.ts")).toEqual([]);
  });

  test("finds a directive inside a template literal's expression", () => {
    const source = [
      "export const x = `${",
      `${["// eslint", "disable-next-line"].join("-")} ${ruleName}`,
      "(value as string)",
      "}`;",
    ].join("\n");

    expect(findDisableComments(source, "probe.ts")).toEqual([2]);
  });

  test("finds a directive in JSX after an apostrophe in the text", () => {
    const source = `export const x = <div>Don't {/* ${eslintDisable} ${ruleName} */}{value as string}</div>;`;

    expect(findDisableComments(source, "probe.tsx")).toEqual([1]);
  });

  test("passes one that names only other rules", () => {
    expect(
      findDisableComments(
        `${disable("disable-next-line")} react-hooks/rules-of-hooks -- why`,
        "probe.ts",
      ),
    ).toEqual([]);
  });
});
