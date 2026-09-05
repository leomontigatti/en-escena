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
// It reads prose through three instruments, because none of them reaches what
// the others do. Function words are *grammar* — the part of the language that
// only shows up when the whole sentence is Spanish. Accents are *morphology* — a
// mark on one word, whatever the sentence is doing. Glossary nouns are
// *vocabulary* — a term the repo has already agreed an English identifier for.
// Measured over the tree, grammar and morphology overlap on 174 occurrences and
// are alone on 186 and 749 respectively (#792): drop any one of them and a clean
// run stops meaning what the gate says it means.
//
// #792 settled the licence the glossary grants. It is not an exemption: prose is
// governed exactly like an identifier, so the only Spanish that survives bare in
// a comment is CODING_STANDARDS' reserved list — `comprobante`, grown only by
// ADR. Everything else the glossary names is a violation, and naming it is done
// the way the identifier rule already does it, by quoting or backticking it.
//
// The scopes it reads are comments, test names and the argument of a
// `new …Error(…)`. Arbitrary string literals are left alone on purpose — Spanish
// UI copy lives in literals — but an error message is engineering prose by the
// same test #592 applied, and eleven Spanish ones outlived that sweep. See
// `findErrorMessages` for why the predicate is exactly this narrow.

// Every directory in the repo that holds `.ts`/`.tsx`/`.mts`/`.mjs`, plus the
// root-level configs `collectScannedFiles` adds. `.sandcastle` is here because
// the agent workflows are code the same way `scripts/` is: a prompt or a
// workflow step is read by a contributor, not by an end user.
export const scannedDirectories = [".sandcastle", "app", "scripts", "tests"];
const sourceFilePattern = /\.(ts|tsx|mts|mjs)$/;

// The docs are engineering prose too, and #592's argument does not stop at the
// file extension: a design note read by a contributor is not something a user
// reads (#792 Q7).
export const scannedDocDirectories = [".claude", ".sandcastle", "docs"];
const docFilePattern = /\.md$/;

// Records of something external, which a sweep may not rewrite. An ADR is the
// decision as it was taken, and `docs/research` cites Argentine tax law by the
// Spanish titles the regulations actually carry — "RG 1415/2003 — Régimen de
// emisión de comprobantes" is the name of the thing, and a translated citation
// leads a reader nowhere (#792 Q7/Q8).
// `.agents` is the same argument one step further out: the skills under it are
// vendored verbatim from their upstream repo and pinned by content hash in
// `skills-lock.json`, so a sweep may not rewrite them — editing one breaks the
// hash and the next `skills add` discards the edit anyway. It scans clean today;
// excluding it is about what happens when it does not, since the remedy would
// have to be unpinning someone else's prose rather than fixing ours.
export const excludedDocDirectories = [".agents", "docs/adr", "docs/research"];

// YAML is on the same rule and used to rest on review, which is how six Spanish
// comments outlived #592 across four workflow files (#793). A `#` comment is
// trivially extractable and the word lists already exist, so gating it is a
// small change — and the alternative is sweeping the six and watching the
// seventh drift back, which is exactly what happened to comments before #791.
//
// `.github` plus the root-level files `collectScannedYaml` adds. The first draft
// of this claimed `.github` was the whole surface; the scan-root test below
// answered with `docker-compose.yml`, `pnpm-workspace.yaml` and `pnpm-lock.yaml`
// — which is the same gap `vitest.config.ts` was hiding in before #791, found
// the same way.
export const scannedYamlDirectories = [".github"];
const yamlFilePattern = /\.(yml|yaml)$/;

// Generated, not written: a lockfile is 330 KB of resolution output that no
// contributor reads as prose, and nobody may rewrite by hand anyway.
// `openai.yml` is vendored with the shadcn skill, on the same argument as
// `.agents` above. This list is file-by-file rather than by directory on
// purpose: a second vendored YAML should fail the scan-root test on arrival and
// be recorded here deliberately, not be absorbed by a prefix nobody revisits.
export const excludedYamlFiles = [
  ".agents/skills/shadcn/agents/openai.yml",
  "pnpm-lock.yaml",
];

// Spanish function words with no English homograph. Deliberately absent:
// `todo`/`todos` (the TODO comment marker), `sea`, `era`, `son`, `sin`, `solo`,
// `algo` (short for algorithm) and `con` (pro/con) — each collides with ordinary
// English technical prose.
//
// Known false positive: `Los Angeles` matches `los`. No such string is in the
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
//
// `de` earns its place by catching the one failure a term-by-term sweep
// reliably produces: translating a word out of the middle of a Spanish label,
// which leaves `capacity de schedule` and `Portal de academies` behind. Nothing
// else sees those — both halves are English and `de` is the only Spanish left.
// It cost 27 findings on the tree and 22 of them were exactly that. Known false
// positive: `de facto`, and a name like `Robert de Niro`; the hyphen guard
// already keeps `de-allocation` out.
const shortSpanishWords = [
  "al",
  "de",
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
  `(?<![\\p{L}\\d-])(?:${[...spanishFunctionWords, ...shortSpanishWords].join("|")})(?![\\p{L}\\d-])`,
  "giu",
);

/**
 * `SE` is southeast, `UN` is the United Nations, `DEL` is a key and `LOS` is
 * line-of-sight; `se`, `un`, `del` and `los` are Spanish. An all-caps match is
 * an acronym at any length — the long list holds `del`, `los` and `sus` too, so
 * the two-letter guard this used to apply was not enough.
 *
 * The cost is a Spanish comment written entirely in capitals, which this cannot
 * see. Prose in caps is rare enough to trade against acronyms in English, which
 * are not.
 */
function isAcronym(match: string): boolean {
  return match === match.toUpperCase() && match !== match.toLowerCase();
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
const accentedWordPattern = /(?<![\p{L}-])[\p{L}-]*[áéíóúñü][\p{L}-]*/giu;

// Proper nouns are not prose. A place name keeps its accent in an English
// sentence the same way `São Paulo` does, so matching one says nothing about the
// language of the comment. Everything here is a name of something real; a word
// that merely looks foreign does not belong on this list — quote it instead.
const accentedProperNouns = new Set(["córdoba"]);

function isProperNoun(match: string): boolean {
  return accentedProperNouns.has(match.toLowerCase());
}

/** `**\`identifier\`** — ui: "Término"`, the one shape every glossary row has. */
const glossaryTermPattern = /—\s*ui:\s*"([^"]+)"/g;

// The third instrument: vocabulary. Every Spanish noun the glossary names is a
// term the codebase has already agreed an English identifier for, so writing it
// bare in a comment is the same choice the identifier rule forbids — and it is
// where the volume is. 749 occurrences are reachable this way and no other,
// because `cupo`, `cronograma`, `evento` and `saldo` carry neither a function
// word nor an accent (#792).
//
// CODING_STANDARDS reserves exactly one term, and growing that list takes an
// ADR. `comprobante` stays Spanish everywhere; everything else the glossary
// names is a violation in prose, quoted or backticked if it must be named.
const reservedTerms = new Set(["comprobante"]);

// Glossary words that are not evidence of Spanish. Each is here for one of
// three reasons, and a word without one of them does not belong:
//
//   - an English word spelled the same: `base`, `bases`, `total`, `portal`,
//     `panel`, `fiscal`, `ranking`, `temporal`;
//   - a proper noun: `arca` is the tax agency, not a common noun;
//   - a function word the grammar rule already owns: `para`.
const glossaryNounExceptions = new Set([
  "arca",
  "base",
  "bases",
  "fiscal",
  "panel",
  "para",
  "portal",
  "ranking",
  "temporal",
  "total",
]);

const testFunctionNames = new Set(["describe", "it", "test"]);
const quoteCharacters = new Set(['"', "'", "`"]);

export type CommentLanguageViolation = {
  filePath: string;
  kind: "comment" | "error message" | "prose" | "test name";
  lineNumber: number;
  markers: string[];
  text: string;
};

type CheckCommentLanguageOptions = {
  /** Source files to scan. Defaults to every scanned directory. */
  files?: string[];
  /** Markdown files to scan. Defaults to every scanned doc directory. */
  docs?: string[];
  rootDirectory?: string;
  /** YAML files to scan. Defaults to every scanned YAML directory. */
  yaml?: string[];
};

type SourceSpan = {
  startIndex: number;
  text: string;
};

/**
 * The Spanish terms the glossary reserves, read from `CONTEXT.md` itself so the
 * two cannot drift apart. Some of them carry a function word — `Bases del
 * evento`, `Descuento por bailarín` — and naming one in an English sentence is
 * the glossary being used as intended, not a Spanish sentence.
 */
export function readGlossaryTerms(rootDirectory: string): string[] {
  const contents = readFileSync(path.join(rootDirectory, "CONTEXT.md"), "utf8");

  return (
    Array.from(contents.matchAll(glossaryTermPattern))
      .map((match) => match[1])
      // Longest first, so `Bases del evento` is blanked whole instead of a
      // shorter term nested inside it taking a bite out of the middle.
      .sort((left, right) => right.length - left.length)
  );
}

/** `coreografía` → `coreografia`, the spelling a URL and a hurried hand use. */
function withoutAccents(word: string): string {
  return word.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * The Spanish nouns the glossary names, one word at a time. Multi-word `ui:`
 * values are split because prose borrows the noun, not the label: `Bases del
 * evento` is where `evento` comes from. Words of three letters or fewer are
 * dropped — they are `del`, `por`, `IVA`, and the grammar rule already holds
 * the ones that matter.
 */
export function readGlossaryNouns(rootDirectory: string): string[] {
  const nouns = new Set<string>();

  for (const term of readGlossaryTerms(rootDirectory)) {
    for (const word of term.split(/[^\p{L}]+/u)) {
      const noun = word.toLowerCase();

      if (
        noun.length > 3 &&
        !reservedTerms.has(noun) &&
        !glossaryNounExceptions.has(noun)
      ) {
        nouns.add(noun);

        // A Spanish plural in `-ón`/`-ín` drops the accent: `asignación` becomes
        // `asignaciones`, which neither the accent rule nor the closed suffix
        // tail can reach. Both instruments miss it, so the plural is listed.
        const plural = noun.replace(
          /([áéíóú])(n)$/u,
          (_, vowel: string, n) => `${"aeiou"["áéíóú".indexOf(vowel)]}${n}es`,
        );

        if (plural !== noun) {
          nouns.add(plural);
        }

        // And the accent-stripped spelling, because the repo writes it itself:
        // the route is `administracion.categorias`, and prose follows the URL.
        // `categorias` and `coreografias` both survived the #792 sweep by
        // sitting in exactly this hole — no accent for morphology to find, and
        // not the spelling the glossary lists.
        nouns.add(withoutAccents(noun));
      }
    }
  }

  // Longest first, so `submodalidad` is matched whole rather than `modalidad`
  // taking a bite out of its tail.
  return [...nouns].sort((left, right) => right.length - left.length);
}

/**
 * The tail catches the inflection the glossary does not list — `profesores` for
 * `profesor`, `cupos` for `cupo` — but it is a closed set of Spanish endings and
 * not `\p{L}*`. An open tail reads the English `activate`, `activation` and
 * `activates` as inflections of `activa`, and all three are live in the tree.
 * The trailing boundary is what makes the closed set bite: without it `activa`
 * matches the first six letters of `activate` and the tail is simply skipped.
 */
function glossaryNounPatternFor(nouns: string[]): RegExp {
  return new RegExp(
    `(?<!\\p{L})(?:${nouns.map(escapeForPattern).join("|")})(?:es|as|os|s|a|o)?(?!\\p{L})`,
    "giu",
  );
}

function escapeForPattern(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The reserved terms, with the inflection the list does not carry: blanking
 * `comprobante` out of `comprobantes` on its own would leave a bare `s` behind.
 * Built once, because both scanners blank the same thing.
 */
const reservedTermPattern = new RegExp(
  `(?<!\\p{L})(?:${[...reservedTerms].map(escapeForPattern).join("|")})\\p{L}*`,
  "giu",
);

function blankTo(match: string): string {
  return match.replace(/[^\n]/g, " ");
}

/**
 * Blanks out the spans of a passage that are data rather than prose: quoted UI
 * copy, backticked code, route paths, URLs and the reserved terms.
 * CODING_STANDARDS calls these out by name — "Spanish inside a quoted string, a
 * route path or a glossary `ui:` value is data, not prose, and stays Spanish".
 * Blanking to spaces of the same width keeps every offset and line break intact,
 * so a match still reports the line it was found on.
 *
 * The trailing `\p{L}*` on the reserved terms swallows the inflection the list
 * does not carry: blanking `comprobante` out of `comprobantes` on its own would
 * leave a bare `s` behind.
 *
 * A `${…}` interpolation is blanked because it is an expression, not prose —
 * `${academia}` in an error message names a variable, and reading it as
 * vocabulary would report the identifier rather than the sentence around it.
 *
 * The route alternative ends on a segment rather than on a slash, because
 * `/administracion/bases-del-evento/precios` has no trailing one and used to
 * leave `precios` behind as bare prose. Nothing reported it while the glossary
 * was an allow-list blanking that word anyway — the gap only surfaced when #792
 * turned the glossary into the thing being looked for.
 */
function blankDataSpans(text: string): string {
  return text
    .replace(
      /\$\{[^}]*\}|`[^`]*`|"[^"]*"|«[^»]*»|“[^”]*”|https?:\/\/\S+|(?<![\p{L}\d])\/[\p{L}\d$_.\-]+(?:\/[\p{L}\d$_.\-]*)*/giu,
      blankTo,
    )
    .replace(reservedTermPattern, blankTo);
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

/**
 * `new` followed by a constructor whose name ends in `Error`: the built-ins, and
 * this repo's `ArcaTimeoutError` and `WebhookVerificationError`.
 *
 * The `new` is load-bearing, not decoration. Dropping it and matching any
 * `…Error(` call reported 22 findings that are all correct Spanish, because this
 * codebase builds its refusals with functions named for what they refuse:
 * `updateError("Ingresá el nombre visible.")`, `actionError`, `creationError`,
 * `genericLoginError` — result builders whose argument is the copy a user reads.
 * No bare `Error(…)` constructor call exists in the tree, so requiring `new`
 * costs nothing and separates the two exactly.
 *
 * The `Error` suffix carries the rest of the predicate. `CobroRefusal`, the one
 * thrown type here that lacks it, exists to carry a *user's* refusal message
 * across a transaction boundary — precisely what this rule must not reach.
 */
const errorConstructorPattern =
  /(?<![\p{L}\d$_.])new\s+[\p{L}\d$_]*Error\s*\(/gu;

/**
 * The string literals a `new Error(…)` call holds.
 *
 * #791 gated comments, test names and markdown, and left string literals alone
 * on purpose: Spanish UI copy lives in literals, so flagging them wholesale
 * would be wrong. The gap that leaves is that a Spanish `throw new Error("…")`
 * passes, even though it is engineering prose by the standard's own definition —
 * a user-facing refusal in this codebase travels as a structured action result
 * or a thrown `Response`, never as a thrown `Error`. Eleven such messages were
 * still in the tree after #592's sweep reported zero.
 *
 * `new Error` is the whole predicate because it is the one call whose argument
 * is engineering prose by construction. `new Response("Acción no soportada.")`
 * sits two lines away in the same files and must stay Spanish: React Router
 * routes a thrown `Response` to the error boundary, so its body is user copy.
 *
 * Matching on the *call* rather than on the literal that opens it is what makes
 * a concatenated message — `"… van " + "las tres juntas o ninguna."` — checked
 * in both halves rather than only the first.
 */
function findErrorMessages(
  contents: string,
  comments: SourceSpan[],
  strings: SourceSpan[],
): SourceSpan[] {
  const calls = errorCallSpans(contents, comments, strings);

  return strings.filter((span) =>
    calls.some(
      (call) => span.startIndex > call.open && span.startIndex < call.close,
    ),
  );
}

function errorCallSpans(
  contents: string,
  comments: SourceSpan[],
  strings: SourceSpan[],
): { close: number; open: number }[] {
  return Array.from(contents.matchAll(errorConstructorPattern)).flatMap(
    (match) => {
      // This guardrail's own tests carry `new Error("…")` inside fixture
      // strings, and the fixtures are not code. Same reasoning as `test("…")`.
      if (isInsideAnySpan(match.index, [...comments, ...strings])) {
        return [];
      }

      const open = match.index + match[0].length - 1;
      const close = indexOfMatchingParenthesis(contents, open);

      return close === -1 ? [] : [{ close, open }];
    },
  );
}

function isInsideAnySpan(index: number, spans: SourceSpan[]): boolean {
  return spans.some(
    (span) =>
      index >= span.startIndex && index < span.startIndex + span.text.length,
  );
}

/** From an opening `(`, the index of the `)` that closes it. */
function indexOfMatchingParenthesis(
  contents: string,
  openIndex: number,
): number {
  let depth = 0;
  let index = openIndex;

  while (index < contents.length) {
    // A parenthesis inside a literal or a comment does not nest.
    const token = tokenAt(contents, index);

    if (token !== null) {
      index = token.stop;
      continue;
    }

    if (contents[index] === "(") {
      depth += 1;
    } else if (contents[index] === ")") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }

    index += 1;
  }

  return -1;
}

function lineNumberAt(contents: string, index: number): number {
  return contents.slice(0, index).split("\n").length;
}

/** The three instruments, over prose whose data spans are already blanked. */
function spanishMarkersIn(
  prose: string,
  glossaryNouns: string[],
): RegExpExecArray[] {
  return [
    ...Array.from(prose.matchAll(spanishFunctionWordPattern)).filter(
      (match) => !isAcronym(match[0]),
    ),
    ...Array.from(prose.matchAll(accentedWordPattern)).filter(
      (match) => !isProperNoun(match[0]),
    ),
    ...(glossaryNouns.length === 0
      ? []
      : Array.from(prose.matchAll(glossaryNounPatternFor(glossaryNouns)))),
  ].sort((left, right) => left.index - right.index);
}

/**
 * Markdown is prose end to end, so there is no comment to find: the file is the
 * passage, and a line is the unit worth reporting. The only difference from a
 * source file is what counts as data — #792 chose the backtick, because that is
 * what `docs/domain` already uses and what renders as the name it is, where a
 * double quote in markdown is ordinary punctuation around ordinary prose.
 */
export function findSpanishProseInMarkdown(input: {
  contents: string;
  filePath: string;
  /** Empty turns the vocabulary instrument off; say so rather than omit it. */
  glossaryNouns: string[];
}): CommentLanguageViolation[] {
  const { glossaryNouns } = input;
  const lines = input.contents.split("\n");

  return blankMarkdownDataSpans(input.contents)
    .split("\n")
    .flatMap((line, index) => {
      const matches = spanishMarkersIn(line, glossaryNouns);

      if (matches.length === 0) {
        return [];
      }

      return [
        {
          filePath: input.filePath,
          kind: "prose" as const,
          lineNumber: index + 1,
          markers: [...new Set(matches.map((match) => match[0].toLowerCase()))],
          text: lines[index].trim().slice(0, 120),
        },
      ];
    });
}

/**
 * Fenced blocks are code whatever language they carry, link targets are
 * addresses, and a backticked run is the name of something. The glossary row is
 * the one shape whose double-quoted value is data by definition: `ui: "Seña"` is
 * the UI term this very file parses out of `CONTEXT.md`, so it is blanked here
 * rather than rewritten into backticks that `readGlossaryTerms` would then have
 * to learn.
 */
function blankMarkdownDataSpans(contents: string): string {
  return contents
    .replace(/^ {0,3}```[^\n]*\n[\s\S]*?^ {0,3}```/gmu, blankTo)
    .replace(/—\s*ui:\s*"[^"\n]*"/gu, blankTo)
    .replace(/\]\([^)\n]*\)/gu, blankTo)
    .replace(
      /`[^`\n]*(?:\n[^`\n]*)?`|https?:\/\/\S+|(?<![\p{L}\d])\/[\p{L}\d$_.\-]+(?:\/[\p{L}\d$_.\-]*)*/giu,
      blankTo,
    )
    .replace(reservedTermPattern, blankTo);
}

/**
 * A `#` opens a YAML comment when it starts the line or follows whitespace and
 * is not inside a quoted scalar. That is the YAML rule, and the two guards are
 * what keep `#` inside a value out of it — a colour, a URL fragment, or the
 * `#305/#391` an issue reference carries.
 *
 * It reads a `#` inside a `run: |` block as a comment too. That is deliberate:
 * a shell comment in a workflow step is read by the same contributor as the
 * YAML comment above it, so the rule has no reason to stop at the block scalar.
 */
function yamlCommentAt(line: string): string | null {
  let quote: string | null = null;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === "#" && (index === 0 || /\s/.test(line[index - 1]))) {
      return line.slice(index);
    }
  }

  return null;
}

/**
 * YAML is prose only in its comments, so unlike markdown there is no question of
 * what counts as a passage: the comment is the unit, and the line is where it is
 * reported. Data is marked the way it is in a source comment — this is code, and
 * `# versión desde \`packageManager\`` is the shape the tree actually carries.
 */
export function findSpanishProseInYaml(input: {
  contents: string;
  filePath: string;
  /** Empty turns the vocabulary instrument off; say so rather than omit it. */
  glossaryNouns: string[];
}): CommentLanguageViolation[] {
  return input.contents.split("\n").flatMap((line, index) => {
    const comment = yamlCommentAt(line);

    if (comment === null) {
      return [];
    }

    const matches = spanishMarkersIn(
      blankDataSpans(comment),
      input.glossaryNouns,
    );

    if (matches.length === 0) {
      return [];
    }

    return [
      {
        filePath: input.filePath,
        kind: "comment" as const,
        lineNumber: index + 1,
        markers: [...new Set(matches.map((match) => match[0].toLowerCase()))],
        text: comment.trim().slice(0, 120),
      },
    ];
  });
}

export function findSpanishProseInSource(input: {
  contents: string;
  filePath: string;
  /** Empty turns the vocabulary instrument off; say so rather than omit it. */
  glossaryNouns: string[];
}): CommentLanguageViolation[] {
  const { glossaryNouns } = input;
  const { comments, strings } = scanSource(input.contents);
  const scopes: {
    kind: CommentLanguageViolation["kind"];
    spans: SourceSpan[];
  }[] = [
    { kind: "comment", spans: comments },
    {
      kind: "error message",
      spans: findErrorMessages(input.contents, comments, strings),
    },
    { kind: "test name", spans: findTestTitles(input.contents, strings) },
  ];

  return scopes.flatMap(({ kind, spans }) =>
    spans.flatMap((span) => {
      const prose = blankDataSpans(span.text);
      const matches = spanishMarkersIn(prose, glossaryNouns);

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
  const glossaryNouns = readGlossaryNouns(rootDirectory);
  const files = options.files ?? collectScannedFiles(rootDirectory);
  const docs = options.docs ?? collectScannedDocs(rootDirectory);
  const yaml = options.yaml ?? collectScannedYaml(rootDirectory);

  return [
    ...files.flatMap((filePath) => {
      const absolutePath = path.resolve(rootDirectory, filePath);

      return findSpanishProseInSource({
        contents: readFileSync(absolutePath, "utf8"),
        filePath: path.relative(rootDirectory, absolutePath),
        glossaryNouns,
      });
    }),
    ...docs.flatMap((filePath) => {
      const absolutePath = path.resolve(rootDirectory, filePath);

      return findSpanishProseInMarkdown({
        contents: readFileSync(absolutePath, "utf8"),
        filePath: path.relative(rootDirectory, absolutePath),
        glossaryNouns,
      });
    }),
    ...yaml.flatMap((filePath) => {
      const absolutePath = path.resolve(rootDirectory, filePath);

      return findSpanishProseInYaml({
        contents: readFileSync(absolutePath, "utf8"),
        filePath: path.relative(rootDirectory, absolutePath),
        glossaryNouns,
      });
    }),
  ];
}

/**
 * The documented directories plus the markdown sitting at the repo root, minus
 * the two directories #792 exempted. The exclusion is by path prefix rather than
 * by a list of files, so a new ADR is covered the day it is written.
 */
function collectScannedDocs(rootDirectory: string): string[] {
  const rootDocs = readdirSync(rootDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && docFilePattern.test(entry.name))
    .map((entry) => path.join(rootDirectory, entry.name));

  return [
    ...rootDocs,
    ...scannedDocDirectories.flatMap((directory) =>
      collectSourceFiles({
        directoryPath: path.join(rootDirectory, directory),
        keeps: (fileName) => docFilePattern.test(fileName),
      }),
    ),
  ].filter((filePath) => {
    const relativePath = path.relative(rootDirectory, filePath);

    return !excludedDocDirectories.some(
      (excluded) =>
        relativePath === excluded || relativePath.startsWith(`${excluded}/`),
    );
  });
}

/**
 * The three scanned directories plus the configs sitting at the repo root.
 * Those six files are the only source outside the directories, and skipping them
 * is not hypothetical: `vitest.config.ts` was carrying seven lines of Spanish
 * that this guardrail flags the moment it is allowed to look at them.
 */
function collectScannedYaml(rootDirectory: string): string[] {
  const keeps = (fileName: string) =>
    yamlFilePattern.test(fileName) && !excludedYamlFiles.includes(fileName);

  const rootYaml = readdirSync(rootDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && keeps(entry.name))
    .map((entry) => path.join(rootDirectory, entry.name));

  return [
    ...rootYaml,
    ...scannedYamlDirectories.flatMap((directory) =>
      collectSourceFiles({
        directoryPath: path.join(rootDirectory, directory),
        keeps,
      }),
    ),
  ];
}

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
    "Prose is governed like an identifier (#792): `comprobante` is the only Spanish that survives bare. Naming the Spanish term is still fine — mark it as the data it is. In code, double-quote UI copy and backtick a name; in markdown, backtick both.",
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
