import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { collectSourceFiles } from "./source-files";

// Engineering prose stays English.
//
// #592 swept 2,198 lines of Spanish comments across 177 files and ~340 Spanish
// test names to zero. Nothing kept them there: the rule lived only in
// CODING_STANDARDS, and the reviews of #698 and #701 both found new Spanish
// comments defended with "the file around it is already Spanish". With the
// baseline at zero this guardrail is the cheap half of that sweep — it runs over
// the whole tree expecting zero, so it needs no diff scoping and no allowlist
// for old debt.
//
// It reads prose through two instruments, because neither reaches what the
// other does. Function words are *grammar* — the part of the language that only
// shows up when the whole sentence is Spanish. Accents are *morphology* — a mark
// on a single word, whatever the sentence is doing. Measured over the tree they
// overlap on 174 occurrences and are alone on 186 and 749 respectively (#792),
// so dropping either one leaves a hole big enough to make a clean run a lie.
//
// Treating every glossary term as vocabulary is the provisional half of that,
// and a wider licence than CODING_STANDARDS' reserved list (`comprobante`
// alone, grown only by ADR) actually grants. #792 owns the question — whether
// English prose should write `seña` at all, or the identifier `CONTEXT.md`
// already maps it to. If that lands on the strict side, the exemption here
// inverts: blank only the reserved terms and flag the rest.

// Every directory in the repo that holds `.ts`/`.tsx`/`.mts`/`.mjs`, plus the
// root-level configs `collectScannedFiles` adds. `.sandcastle` is here because
// the agent workflows are code the same way `scripts/` is: a prompt or a
// workflow step is read by a contributor, not by an end user.
export const scannedDirectories = [".sandcastle", "app", "scripts", "tests"];
const sourceFilePattern = /\.(ts|tsx|mts|mjs)$/;

// Spanish function words with no English homograph. Deliberately absent:
// `todo`/`todos` (the TODO comment marker), `sea`, `era`, `son`, `sin`, `solo`,
// `algo` (short for algorithm) and `con` (pro/con) — each collides with ordinary
// English technical prose.
//
// Known false positive: "Los Angeles" matches `los`. No such string is in the
// tree; if one arrives, quote it and it becomes data.
const spanishFunctionWords = [
  "además",
  "allí",
  "antes",
  "aquí",
  "así",
  "aunque",
  "cada",
  "como",
  "cómo",
  "cuando",
  "cuándo",
  "cuál",
  "cuyo",
  "debe",
  "deben",
  "del",
  "desde",
  "después",
  "donde",
  "dónde",
  "esa",
  "ese",
  "eso",
  "esta",
  "estas",
  "este",
  "estos",
  "está",
  "están",
  "entonces",
  "entre",
  "fue",
  "hace",
  "hacen",
  "hacer",
  "hasta",
  "hay",
  "las",
  "los",
  "más",
  "menos",
  "mientras",
  "misma",
  "mismo",
  "muy",
  "nada",
  "nunca",
  "otra",
  "otro",
  "para",
  "pero",
  "por",
  "porque",
  "puede",
  "pueden",
  "que",
  "qué",
  "queda",
  "quedan",
  "quien",
  "quién",
  "según",
  "siempre",
  "sino",
  "sobre",
  "sólo",
  "sus",
  "también",
  "tiene",
  "tienen",
  "toda",
  "todas",
  "una",
  "unas",
  "unos",
  "ya",
];

// Short Spanish words with no English homograph, kept apart because they need
// one extra guard: matched case-insensitively they would also hit the acronyms
// `UN`, `SE` and `ES`, so an all-caps occurrence is rejected below.
//
// Without this tier the floor sits too high for ordinary short Spanish:
// `// Se ejecuta al montar el componente.` and `test("cierra la sesión activa")`
// are built almost entirely out of words this short, and both were live in the
// tree until it was added.
const shortSpanishWords = [
  "al",
  "el",
  "es",
  "la",
  "lo",
  "ni",
  "se",
  "su",
  "un",
  "sí",
];

const spanishFunctionWordPattern = new RegExp(
  `(?<![\\p{L}-])(?:${[...spanishFunctionWords, ...shortSpanishWords].join("|")})(?![\\p{L}-])`,
  "giu",
);

/**
 * `SE` is southeast and `UN` is the United Nations; `se` and `un` are Spanish.
 * Only the short list is ambiguous this way — every long word stands on its own.
 */
function isAcronym(match: string): boolean {
  return match.length <= 2 && match === match.toUpperCase();
}

// The second instrument: morphology. A word carrying an accent or `ñ` is
// Spanish, whatever the sentence around it is doing.
//
// It exists because the function-word list has a shape of blind spot it can
// never cover on its own. `// ARCA respondió y no autorizó.` — the example #769
// gave — is a whole Spanish sentence built from a proper noun and two conjugated
// verbs, and no list of function words will ever hold `respondió`. Measured over
// the tree the two instruments are near-disjoint: 186 occurrences only this rule
// reaches, 749 only the vocabulary rule reaches, 174 both (#792).
const accentedWordPattern = /(?<![\p{L}-])[\p{L}-]*[áéíóúñ][\p{L}-]*/giu;

// Proper nouns are not prose. A place name keeps its accent in an English
// sentence the same way "São Paulo" does, so matching one says nothing about the
// language of the comment. Everything here is a name of something real; a word
// that merely looks foreign does not belong on this list — quote it instead.
const accentedProperNouns = new Set(["córdoba"]);

function isProperNoun(match: string): boolean {
  return accentedProperNouns.has(match.toLowerCase());
}

/** `**\`identifier\`** — ui: "Término"`, the one shape every glossary row has. */
const glossaryTermPattern = /—\s*ui:\s*"([^"]+)"/g;

const testFunctionNames = new Set(["describe", "it", "test"]);
const quoteCharacters = new Set(['"', "'", "`"]);

export type CommentLanguageViolation = {
  filePath: string;
  kind: "comment" | "test name";
  lineNumber: number;
  markers: string[];
  text: string;
};

type CheckCommentLanguageOptions = {
  files?: string[];
  rootDirectory?: string;
};

type SourceSpan = {
  startIndex: number;
  text: string;
};

/**
 * The Spanish terms the glossary reserves, read from `CONTEXT.md` itself so the
 * two cannot drift apart. Some of them carry a function word — "Bases del
 * evento", "Descuento por bailarín" — and naming one in an English sentence is
 * the glossary being used as intended, not a Spanish sentence.
 */
export function readGlossaryTerms(rootDirectory: string): string[] {
  const contents = readFileSync(path.join(rootDirectory, "CONTEXT.md"), "utf8");

  return (
    Array.from(contents.matchAll(glossaryTermPattern))
      .map((match) => match[1])
      // Longest first, so "Bases del evento" is blanked whole instead of a
      // shorter term nested inside it taking a bite out of the middle.
      .sort((left, right) => right.length - left.length)
  );
}

function escapeForPattern(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function blankTo(match: string): string {
  return match.replace(/[^\n]/g, " ");
}

/**
 * Blanks out the spans of a passage that are data rather than prose: quoted UI
 * copy, backticked code, route paths, URLs and reserved glossary terms.
 * CODING_STANDARDS calls these out by name — "Spanish inside a quoted string, a
 * route path or a glossary `ui:` value is data, not prose, and stays Spanish".
 * Blanking to spaces of the same width keeps every offset and line break intact,
 * so a match still reports the line it was found on.
 */
function blankDataSpans(text: string, glossaryTerms: string[]): string {
  const blanked = text.replace(
    /`[^`]*`|"[^"]*"|'[^']*'|«[^»]*»|“[^”]*”|https?:\/\/\S+|(?<![\p{L}\d])\/[\p{L}\d$_.\-/]*\//giu,
    blankTo,
  );

  if (glossaryTerms.length === 0) {
    return blanked;
  }

  // The trailing `\p{L}*` swallows the inflection the glossary does not list:
  // blanking "Profesor" out of "profesores" on its own would leave a bare "es"
  // behind, which then reads as the Spanish word it is not. The leading
  // boundary stops a term from matching inside a longer unrelated word.
  return blanked.replace(
    new RegExp(
      `(?<!\\p{L})(?:${glossaryTerms.map(escapeForPattern).join("|")})\\p{L}*`,
      "giu",
    ),
    blankTo,
  );
}

/**
 * Comments and string literals, found with a scanner rather than a line match.
 * A line match cannot tell `//` in a comment from `//` in
 * `"http://localhost/..."`, and it splits a backticked term wrapping across two
 * lines into halves that no longer look like data. Both were real false
 * positives while this was built.
 *
 * A regex literal holding an unescaped `//` would be misread as a comment. That
 * costs a spurious failure at worst, never a miss, and no such literal exists in
 * the tree.
 */
function scanSource(contents: string): {
  comments: SourceSpan[];
  strings: SourceSpan[];
} {
  const comments: SourceSpan[] = [];
  const strings: SourceSpan[] = [];
  let index = 0;

  while (index < contents.length) {
    const token = tokenAt(contents, index);

    if (token === null) {
      index += 1;
      continue;
    }

    if (token.kind === "comment") {
      comments.push({
        startIndex: index,
        text: contents.slice(index, token.stop),
      });
    } else {
      // The span of a literal is what it holds, quotes excluded.
      strings.push({
        startIndex: index + 1,
        text: contents.slice(index + 1, Math.max(index + 1, token.stop - 1)),
      });
    }

    index = token.stop;
  }

  return { comments: mergeAdjacentLineComments(comments, contents), strings };
}

/** The comment or string literal opening at `index`, and where it ends. */
function tokenAt(
  contents: string,
  index: number,
): { kind: "comment" | "string"; stop: number } | null {
  const character = contents[index];

  if (character !== "/") {
    return quoteCharacters.has(character)
      ? {
          kind: "string",
          stop: skipStringLiteral({ contents, quote: character, start: index }),
        }
      : null;
  }

  const next = contents[index + 1];

  if (next === "/") {
    return { kind: "comment", stop: indexOfOrEnd(contents, "\n", index) };
  }

  if (next === "*") {
    return {
      kind: "comment",
      stop: Math.min(
        indexOfOrEnd(contents, "*/", index + 2) + 2,
        contents.length,
      ),
    };
  }

  return null;
}

/** Where `needle` starts, or the end of `contents` when it never does. */
function indexOfOrEnd(contents: string, needle: string, from: number): number {
  const found = contents.indexOf(needle, from);
  return found === -1 ? contents.length : found;
}

function skipStringLiteral(input: {
  contents: string;
  quote: string;
  start: number;
}): number {
  let index = input.start + 1;

  while (index < input.contents.length) {
    const character = input.contents[index];

    if (character === "\\") {
      index += 2;
      continue;
    }

    if (character === input.quote) {
      return index + 1;
    }

    // An unterminated `'` or `"` is an apostrophe in prose, not a literal; a
    // template literal is the only one that legitimately spans lines.
    if (character === "\n" && input.quote !== "`") {
      return index;
    }

    index += 1;
  }

  return input.contents.length;
}

/**
 * A run of `//` lines is one comment, so a backticked term wrapping across two
 * of them is still recognised as the single data span it is.
 */
function mergeAdjacentLineComments(
  spans: SourceSpan[],
  contents: string,
): SourceSpan[] {
  return spans.reduce<SourceSpan[]>((merged, span) => {
    const previous = merged.at(-1);

    if (!previous?.text.startsWith("//") || !span.text.startsWith("//")) {
      return [...merged, span];
    }

    const between = contents.slice(
      previous.startIndex + previous.text.length,
      span.startIndex,
    );

    if (!/^\n[ \t]*$/.test(between)) {
      return [...merged, span];
    }

    previous.text += `${between}${span.text}`;
    return merged;
  }, []);
}

/**
 * The callee of the call a string literal opens, so `test("…")` is recognised by
 * what it is rather than by a regex over the file. That distinction matters
 * here: this guardrail's own tests carry `test("…")` inside fixture strings, and
 * a regex would read those fixtures as real test names.
 */
function calleeBefore(
  contents: string,
  stringStartIndex: number,
): string | null {
  const openParen = skipBackwardsWhile(contents, stringStartIndex - 2, /\s/);

  if (contents[openParen] !== "(") {
    return null;
  }

  // `test.each([…])("…")`: step back over the argument group of the first call.
  const beforeParen = skipBackwardsWhile(contents, openParen - 1, /\s/);
  const afterGroup =
    contents[beforeParen] === ")"
      ? skipBackwardsWhile(
          contents,
          skipBalancedParenthesesBackwards(contents, beforeParen),
          /\s/,
        )
      : beforeParen;

  const chainStart = skipBackwardsWhile(contents, afterGroup, /[\w$.]/);
  const chain = contents.slice(chainStart + 1, afterGroup + 1);

  return chain.length > 0 ? chain : null;
}

function skipBackwardsWhile(
  contents: string,
  from: number,
  pattern: RegExp,
): number {
  let index = from;

  while (index >= 0 && pattern.test(contents[index])) {
    index -= 1;
  }

  return index;
}

/** From a closing `)`, the index just before its opening `(`. */
function skipBalancedParenthesesBackwards(
  contents: string,
  from: number,
): number {
  let depth = 0;

  for (let index = from; index >= 0; index -= 1) {
    if (contents[index] === ")") {
      depth += 1;
    } else if (contents[index] === "(") {
      depth -= 1;

      if (depth === 0) {
        return index - 1;
      }
    }
  }

  return -1;
}

function findTestTitles(contents: string, strings: SourceSpan[]): SourceSpan[] {
  return strings.filter((span) => {
    const callee = calleeBefore(contents, span.startIndex);
    return callee !== null && testFunctionNames.has(callee.split(".")[0]);
  });
}

function lineNumberAt(contents: string, index: number): number {
  return contents.slice(0, index).split("\n").length;
}

/**
 * The prose the guardrail reads, each span paired with its blanked twin. Sweeps
 * use it to rewrite a term only where the guardrail can see it: a backticked or
 * quoted occurrence is spaces in `blanked`, so no offset there ever matches.
 */
export function proseSpansOf(
  contents: string,
  rootDirectory: string = process.cwd(),
): (SourceSpan & { blanked: string })[] {
  const glossaryTerms = readGlossaryTerms(rootDirectory);
  const { comments, strings } = scanSource(contents);

  return [...comments, ...findTestTitles(contents, strings)].map((span) => ({
    ...span,
    blanked: blankDataSpans(span.text, glossaryTerms),
  }));
}

export function findSpanishProseInSource(input: {
  contents: string;
  filePath: string;
  glossaryTerms?: string[];
}): CommentLanguageViolation[] {
  const glossaryTerms = input.glossaryTerms ?? [];
  const { comments, strings } = scanSource(input.contents);
  const scopes: {
    kind: CommentLanguageViolation["kind"];
    spans: SourceSpan[];
  }[] = [
    { kind: "comment", spans: comments },
    { kind: "test name", spans: findTestTitles(input.contents, strings) },
  ];

  return scopes.flatMap(({ kind, spans }) =>
    spans.flatMap((span) => {
      const prose = blankDataSpans(span.text, glossaryTerms);
      const matches = [
        ...Array.from(prose.matchAll(spanishFunctionWordPattern)).filter(
          (match) => !isAcronym(match[0]),
        ),
        ...Array.from(prose.matchAll(accentedWordPattern)).filter(
          (match) => !isProperNoun(match[0]),
        ),
      ].sort((left, right) => left.index - right.index);

      if (matches.length === 0) {
        return [];
      }

      return [
        {
          filePath: input.filePath,
          kind,
          lineNumber: lineNumberAt(
            input.contents,
            span.startIndex + matches[0].index,
          ),
          markers: [...new Set(matches.map((match) => match[0].toLowerCase()))],
          text: span.text.trim().split("\n")[0].slice(0, 120),
        },
      ];
    }),
  );
}

export async function checkCommentLanguage(
  options: CheckCommentLanguageOptions = {},
): Promise<CommentLanguageViolation[]> {
  const rootDirectory = options.rootDirectory ?? process.cwd();
  const glossaryTerms = readGlossaryTerms(rootDirectory);
  const files = options.files ?? collectScannedFiles(rootDirectory);

  return files.flatMap((filePath) => {
    const absolutePath = path.resolve(rootDirectory, filePath);

    return findSpanishProseInSource({
      contents: readFileSync(absolutePath, "utf8"),
      filePath: path.relative(rootDirectory, absolutePath),
      glossaryTerms,
    });
  });
}

/**
 * The three scanned directories plus the configs sitting at the repo root.
 * Those six files are the only source outside the directories, and skipping them
 * is not hypothetical: `vitest.config.ts` was carrying seven lines of Spanish
 * that this guardrail flags the moment it is allowed to look at them.
 */
function collectScannedFiles(rootDirectory: string): string[] {
  const rootFiles = readdirSync(rootDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && sourceFilePattern.test(entry.name))
    .map((entry) => path.join(rootDirectory, entry.name));

  return [
    ...rootFiles,
    ...scannedDirectories.flatMap((directory) =>
      collectSourceFiles({
        directoryPath: path.join(rootDirectory, directory),
        keeps: (fileName) => sourceFilePattern.test(fileName),
      }),
    ),
  ];
}

async function runCommentLanguageGuardrail(): Promise<void> {
  const violations = await checkCommentLanguage();

  if (violations.length === 0) {
    return;
  }

  const lines = [
    `Comment-language guardrail found ${violations.length} Spanish ${
      violations.length === 1 ? "passage" : "passages"
    }:`,
    ...violations.map(
      (violation) =>
        `- ${violation.filePath}:${violation.lineNumber} (${violation.kind}, matched ${violation.markers.join(", ")})\n  ${violation.text}`,
    ),
    "",
    "Engineering prose is English (CODING_STANDARDS, 'Code Language'): Spanish is for what a user reads. The file around it being Spanish is not a reason — that argument is the one #592 retired.",
    "Spanish domain nouns the glossary reserves are fine inside an English sentence; quote UI copy, route paths and identifiers so they read as the data they are.",
  ];

  throw new Error(lines.join("\n"));
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  runCommentLanguageGuardrail().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
