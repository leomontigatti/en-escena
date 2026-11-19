import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parseSync } from "oxc-parser";
import { z } from "zod";

import {
  baseProblems,
  type BaseList,
  countProblems,
  type Counts,
  parseCounts,
  type Ratchet,
  readBaseList,
  trackedSourceFiles,
  writeCounts,
} from "./ratchet";

// React effects, held by a ratchet until they live in named hooks.
//
// An effect belongs in a named hook in `app/hooks/` (shadcn's
// `app/components/ui/` aside). The files that call one anywhere else are
// counted in the list, which only falls: a new effect elsewhere fails, and a
// file whose effects move out lowers its entry with `--write`. No lint rule
// backs it: the count already fails a new effect, and an allowlist override of
// `no-restricted-imports` would have to restate that rule's other options.

const listPath = "scripts/effect-allowlist.json";
const standards = "docs/agents/coding-standards.md#react-effects";
const effectHooks = new Set([
  "useEffect",
  "useLayoutEffect",
  "useInsertionEffect",
]);
const notCounted = ["app/hooks/**", "app/components/ui/**"];

const ratchet: Ratchet = {
  listPath,
  describe: (n) => `${n} effect${n === 1 ? "" : "s"}`,
  instead: `Move the effect into a named hook in app/hooks/, or replace it with an event handler, derived state or the loader (${standards})`,
  write: "`pnpm check:effects --write`",
};

// The few AST shapes the count reads, as oxc-parser's ESTree output has them.
const identifier = z.object({
  type: z.literal("Identifier"),
  name: z.string(),
});
const stringLiteral = z.object({
  type: z.literal("Literal"),
  value: z.string(),
});
// A name an import spells: `useEffect`, or `"useEffect"`.
const name = z.union([
  identifier.transform(({ name }) => name),
  stringLiteral.transform(({ value }) => value),
]);
const reactImport = z.object({
  type: z.literal("ImportDeclaration"),
  source: z.object({ value: z.literal("react") }),
  specifiers: z.array(
    z.object({
      type: z.string(),
      local: identifier,
      imported: name.optional(),
    }),
  ),
});
const directCall = z.object({
  type: z.literal("CallExpression"),
  callee: identifier,
});
// `React.useEffect` names the hook and `React["useEffect"]` spells it as a
// string; `React[useEffect]` reads a variable, whatever it is called.
const memberCall = z.object({
  type: z.literal("CallExpression"),
  callee: z.union([
    z
      .object({
        type: z.literal("MemberExpression"),
        computed: z.literal(false),
        object: identifier,
        property: identifier,
      })
      .transform(({ object, property }) => ({
        object,
        property: property.name,
      })),
    z
      .object({
        type: z.literal("MemberExpression"),
        computed: z.literal(true),
        object: identifier,
        property: stringLiteral,
      })
      .transform(({ object, property }) => ({
        object,
        property: property.value,
      })),
  ]),
});

/** The local names the imports from `react` give the effect hooks and the module. */
function reactBindings(statements: unknown[]) {
  const hooks = new Set<string>();
  const modules = new Set<string>();
  const specifiers = statements.flatMap(
    (statement) => reactImport.safeParse(statement).data?.specifiers ?? [],
  );

  for (const { type, local, imported } of specifiers) {
    if (type !== "ImportSpecifier" || imported === "default") {
      // A default or namespace import reaches every hook as a member.
      modules.add(local.name);
    } else if (imported !== undefined && effectHooks.has(imported)) {
      hooks.add(local.name);
    }
  }

  return { hooks, modules };
}

type Bindings = ReturnType<typeof reactBindings>;

function isEffectCall(node: unknown, { hooks, modules }: Bindings): boolean {
  const direct = directCall.safeParse(node).data;
  const member = memberCall.safeParse(node).data;

  return (
    (direct !== undefined && hooks.has(direct.callee.name)) ||
    (member !== undefined &&
      modules.has(member.callee.object.name) &&
      effectHooks.has(member.callee.property))
  );
}

// Checked before the schemas, which are too slow to run on every node.
const isCall = (node: unknown) =>
  typeof node === "object" &&
  node !== null &&
  "type" in node &&
  node.type === "CallExpression";

function childrenOf(node: unknown): unknown[] {
  if (typeof node !== "object" || node === null) {
    return [];
  }

  return Object.values(node).flatMap((value: unknown) =>
    Array.isArray(value) ? value : [value],
  );
}

/** How many calls to React's effect hooks `source` makes; `file` picks the language. */
export function countEffects(source: string, file: string): number {
  const { program, errors } = parseSync(file, source);

  // A file that does not parse would count as none and drop its entry.
  if (errors.length > 0) {
    throw new Error(`${file}: cannot parse it to count its effects.`);
  }

  const bindings = reactBindings(program.body);
  const pending: unknown[] = [program];
  let count = 0;

  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (isCall(node) && isEffectCall(node, bindings)) {
      count++;
    }

    pending.push(...childrenOf(node));
  }

  return count;
}

export type EffectRatchetInput = {
  counts: Counts;
  list: Counts;
  base: BaseList;
};

/** Every way the tree and its list disagree; empty when they agree. */
export function effectProblems({
  counts,
  list,
  base,
}: EffectRatchetInput): string[] {
  return [
    ...countProblems(ratchet, counts, list),
    ...baseProblems(ratchet, list, base),
  ];
}

function countTree(): Counts {
  const counts: Counts = {};

  for (const file of trackedSourceFiles(notCounted)) {
    const source = readFileSync(file, "utf8");
    // Every way to reach an effect hook spells its name, so a file without it is
    // not worth parsing.
    const count = source.includes("Effect") ? countEffects(source, file) : 0;

    if (count > 0) {
      counts[file] = count;
    }
  }

  return counts;
}

function main(): void {
  const counts = countTree();

  if (process.argv.includes("--write")) {
    writeCounts(listPath, counts);
    console.log(
      `${listPath}: ${Object.keys(counts).length} files written from the tree.`,
    );

    return;
  }

  const problems = effectProblems({
    counts,
    list: parseCounts(readFileSync(listPath, "utf8")),
    base: readBaseList(listPath),
  });

  if (problems.length === 0) {
    return;
  }

  console.error(
    [
      `React effects (${standards}):`,
      ...problems.map((problem) => `- ${problem}`),
    ].join("\n"),
  );
  process.exitCode = 1;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main();
}
