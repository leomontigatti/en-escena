# Coding Standards

These standards started from Matt Pocock's `course-video-manager` standards,
adapted to this repo. They bind every session and every reviewer, human or
agent. Keep the principles; add framework-specific rules only when the repo
actually adopts that framework or pattern.

## Testing

Tests should verify behavior through public interfaces, not implementation
details. Code can change internally; tests should fail only when observable
behavior changes.

Prefer integration-style tests that exercise real code paths through the public
API. Test names should describe what the system does, not how it does it.

Mock at system boundaries only:

- External APIs
- Time and randomness
- File systems, databases, or services when a real instance is not practical

Do not mock our own internal collaborators. If code is hard to test without
mocking internal modules, redesign the interface.

Avoid tests that simply restate trivial implementation details, such as a
one-line string concatenation or direct mapping. These tests add little
confidence and tend to break during harmless refactors.

Every test names the bug it catches: the wrong implementation that would make
it fail. The anti-patterns that cannot, and the rules on fixtures and on
deleting redundant tests, are in the
[`tdd` skill](../../.agents/skills/tdd/SKILL.md). A test never asserts that a
document contains fixed text; it checks a doc's structure against something
outside it (a link resolves, an index matches its files, a value matches the
code that enforces it). `pnpm check:docs-tests` enforces that one.

### Test support files

A fixture, builder or render helper that tests under `app/` share lives in one
of two places, chosen by who uses it:

- **One domain's tests**: `<name>.test-support.ts` (`.tsx` when it renders),
  beside the code it builds for: `app/lib/events/bases.test-support.ts`,
  `app/lib/auth/access-auth.test-support.ts`.
- **Tests across domains**: a module in a `test-support/` directory.
  `app/lib/test-support/` holds what any test may want (requests, forms,
  academies, the DOM); `app/features/<area>/test-support/` and
  `app/lib/admin/test-support/` hold what one area's tests share.

No other suffix (`*.test-helpers.ts`, `*-test-fixtures.server.db.ts`,
`fixtures.ts`): the documentation gate recognises the `.test-support` suffix
and the directory as test code, and a reader finds every fixture with one
search. Identifiers are English like the rest of the code. Before adding a file, extend
the one that already builds those rows or requests, as the
[`tdd` skill](../../.agents/skills/tdd/SKILL.md) says; a fixture that a second
domain starts importing moves to `app/lib/test-support/`.

### Component tests

Test meaningful logic or observable behaviour. Do not render components to
static markup to assert props, classes or attributes, and do not add tests that
merely assert callback wiring or mirror the implementation.

Since [ADR-0016](../adr/0016-local-implementation.md), implementation runs
in a local session with a browser, and what a component renders is verified
there, against the real layout and styles, rather than in jsdom. A jsdom test
earns its place when it covers something a glance at the page would not:

- **Keep**: reducers, state machines, validation, formatting and label logic
  (ideally extracted into a pure module and tested without React, per
  [FRONTEND-TDD.md](../../.agents/skills/implement/FRONTEND-TDD.md)), and user
  flows that type or click and assert the resulting behaviour — what gets
  submitted, what the user is told, what becomes disabled — or an
  accessibility contract such as focus, labels or roles a keyboard user
  depends on.
- **Do not write**: a render that checks a prop's text appears in the DOM, a
  Tailwind class or attribute, that a callback fired when its button was
  clicked with nothing observable following, or an assertion that restates
  the JSX.

A regression test for a real bug stays even when its assertion looks like
markup: the bug is the reason it exists, and its name or commit should say so.

## Documentation Gate

Some code has a current-state document that must stay in step with it. The
mapping is `app/lib/shared/doc-map.json`, and CI's `docs-gate` job fails a PR
that changes mapped code without changing its document:

| Document                            | Code that must trigger it                                           |
| ----------------------------------- | ------------------------------------------------------------------- |
| `docs/domain/access.md`             | `app/lib/auth/**`                                                   |
| `docs/operations/infrastructure.md` | `app/lib/storage/**`, `app/lib/portal/choreography-music.server.ts` |

Test files (`*.test.ts`, `*.test.tsx`, `*.test-support.ts(x)`, anything under a
`test-support/` directory) never fire it.
Deletions and renames of mapped code do.

If your change touches mapped code, do one of two things **before committing**:

- update the document so it describes what the code now does; or
- add this trailer, verbatim, to a commit in the branch:

  ```
  Doc-Change-Not-Needed: <reason>
  ```

The gate asks whether the document was considered — a reasoned "no" is a
legitimate answer, and the trailer is how you record it. Note it must be on a
commit: a label or a PR-body line does not re-run CI, so neither can work here.
A mapped change committed with neither of the above leaves `docs-gate` red on the
PR; verify locally with `pnpm check:doc-map` before pushing.

## TDD Workflow

When using TDD, work in vertical slices:

1. Write one failing test.
2. Implement only enough to pass it.
3. Repeat with the next behavior.
4. Refactor only while green.

Do not write a large suite of imagined tests before touching implementation.
Each test should respond to what the previous slice revealed.

## Interface Design

Prefer deep modules: small public interfaces that hide meaningful complexity.
Avoid shallow modules that expose many methods or parameters while doing little
inside.

Scrutinize optional parameters. They are a common source of bugs by omission.
Prefer a smaller, explicit interface over broad backwards-compatible parameter
bags when correctness is at stake.

Design for testability:

- Accept dependencies instead of constructing external dependencies internally.
- Return values where practical instead of hiding behavior behind side effects.
- Keep public surface area small so behavior is easier to exercise.

## Style

Choose clarity over cleverness. Prefer explicit control flow over compact code
that is harder to inspect, especially nested ternaries and dense conditionals.

Use comments only when they explain non-obvious intent or constraints. Avoid
comments that narrate what the next line already says.

For local option arrays passed to components, keep short one-off options inline
at the call site so the visible label and submitted value can be read together.
Extract options to a named constant or helper when they are reused, long, dynamic,
or the name captures meaningful domain intent.

## Code Language

The product is Spanish; the codebase is English.

**Spanish for anything a user reads. English for everything else.**

| Layer                                  | Language                         | Example                                         |
| -------------------------------------- | -------------------------------- | ----------------------------------------------- |
| UI strings, page titles, URLs          | Spanish                          | `"Comprobante"`, `/administracion/comprobantes` |
| Code identifiers, comments, docs, ADRs | English                          | `loadAcademyFinances`                           |
| Commit messages, PR titles and bodies  | English                          | `fix(choreographies): …`                        |
| GitHub issues and review replies       | English                          | `Deepen the list query: …`                      |
| External-system adapters               | the external system's vocabulary | `ArcaVoucher`, `createVoucher`                  |

**Everything on GitHub is engineering prose**, so it is English: issues, commits,
PR titles and bodies, review replies. The owner settled this on 2026-09-27,
replacing the earlier "issues stay Spanish for now" row; issues written before
then may still be Spanish, and are not rewritten. Spanish appears there only as
data — the UI copy or the domain term a finding is about, in backticks.

Route filenames are URLs, so they stay Spanish
(`administracion.finanzas_.$academyId.tsx`) while the symbols they export are
English (`loadAcademyFinances`). That mapping is intentional, not drift.

"Docs" means every engineering doc, with no exceptions: ADRs, `docs/agents/`,
`docs/domain/`, the glossary (`GLOSSARY.md`), the repo index (`AGENTS.md`) and
the style guide. No user reads these files, so the rule above already decides
them. Being _about_ the product surface does not make a file part of it —
otherwise ADRs would qualify too.

### The surrounding file does not decide the language

"Consistent with the file" is not an argument for a Spanish comment: the tree's
Spanish comments and test names were swept to zero, and `pnpm check:comment-language`
fails the commit and the build on Spanish prose in a comment, a test name or a
thrown error message.

The converse still holds: **do not opportunistically translate** comments you are
not otherwise touching. The sweep is done, so a stray Spanish line is now a bug
report, not an invitation — fix it in a PR that says so rather than burying it in
a feature diff nobody asked to review.

The guardrail reads prose through three instruments, because none of them
reaches what the others do. **Grammar**: Spanish function words, which only show
up when the whole sentence is Spanish. **Morphology**: any word carrying an
accent or `ñ`, whatever the sentence is doing — this is what catches
`// ARCA respondió y no autorizó.`, a sentence with no function word in it at
all. **Vocabulary**: every Spanish noun `GLOSSARY.md` names. Measured over the
tree, grammar and morphology overlap on 174 occurrences and are alone on 186 and
749: drop any one and a clean run stops meaning what the gate says it means.

The glossary grants no licence: **prose is governed exactly like an identifier.** A bare Spanish noun in an English comment is the same
choice the identifier rule forbids, so the only Spanish that survives bare is the
reserved list below. Naming the Spanish term is still fine — it just has to be
marked as the data it is, which is what the identifier rule always asked for.
`// the cupo of the cronograma` is a violation; ``// the `Cupo de cronograma`
column`` is not.

It covers `.ts`, `.tsx`, `.mts` and `.mjs` under `.github/`, `app/`,
`scripts/` and `tests/`, plus the config files at the repo root — that is every
directory in the repo holding a file of those extensions, which is the point:
`vitest.config.ts` was hiding seven lines of Spanish behind exactly such a gap,
and the runner's old `.sandcastle/` folder was the next one waiting. A test derives the expected roots
from `git ls-files`, so the next gap of that shape fails rather than hides.

**Markdown is covered too**: `.md` under `.agents/`, `.claude/`, `.github/`
and `docs/`, plus the repo root. Two directories are exempt, for one reason — a record
of something external may not be rewritten. `docs/adr/` is the decision as it was
taken. `docs/research/` cites Argentine tax law by the titles the regulations
actually carry, and `RG 1415/2003 — Régimen de emisión de comprobantes` is the
name of the thing: a translated citation leads a reader nowhere.

### `throw new Error("…")` is engineering prose

The guardrail does not read arbitrary string literals, and that is deliberate:
Spanish UI copy lives in literals, so flagging them wholesale would be wrong.
That left one gap wide enough to matter — a Spanish `throw new Error("…")` is
engineering prose by this section's own test, since nobody but a developer or an
operator ever reads it. **The argument of a `new …Error(…)` is checked like a comment.**

The predicate is narrow on purpose, and both halves of it earn their place:

- **`new` is required.** This codebase names its refusal builders for what they
  refuse — `updateError("Ingresá el nombre visible.")`, `actionError`,
  `creationError`, `genericLoginError`. Their argument is the copy a user reads.
  Matching any `…Error(` call instead reported 22 findings, every one of them
  correctly Spanish.
- **The constructor name must end in `Error`.** `new Response("Acción no
soportada.")` sits two lines away in the same files and stays Spanish: React
  Router routes a thrown `Response` to the error boundary, so its body is user
  copy. `CobroRefusal` carries a user's refusal across a transaction boundary and
  is deliberately not named `…Error`.

**A user-facing refusal never travels as a thrown `Error` here.** It is a
structured action result or a thrown `Response`. If you find yourself wanting to
throw an `Error` at a user, that is the bug — not this rule.

Marking still works the usual way, so ``throw new Error("Expected `Bases del
evento` to exist.")`` is fine. What the gate cannot see is a message assembled
from a fragment passed in as a variable: `decodePem(…, "El certificado")` fed a
Spanish subject into an English sentence and the gate never saw it.

**YAML is covered too**: `.yml` and `.yaml` under `.github/`, plus the
repo root. A `#` opens a comment at line start or after whitespace and outside a
quoted scalar, which is YAML's own rule, so a `#` inside a value — `#fff`, or the
`#` of an issue reference — is not one. A shell comment inside a `run: |`
block _is_ read, because the contributor reading it is the one reading the YAML
comment above it. One exclusion: `pnpm-lock.yaml` is generated, not written.

**Shell is covered too**:
`.sh` under `.agents/` and `scripts/`, plus the repo root. Its `#` comments are
read by YAML's rule, the same one a `run: |` block already went through. Its
**stderr is read like a thrown `Error`**, because that is what it is: an agent
hook's stderr is the sentence the agent is handed back, so nobody but an
agent or an operator ever reads it.

The predicate reads the quoted strings on a line that redirects to `>&2`, and the
literals assigned to a variable the file interpolates into one — `instruction="…"`
three lines above `printf … "$instruction" >&2` is how `stop-typecheck-lint.sh`
writes it, and reading the redirect line alone would miss it. A command
substitution is excluded: `output="$(pnpm typecheck 2>&1)"` is the command's
output, not prose. A heredoc body redirected to stderr is not read yet; none
exists in the tree.

One file type is exempt from every direction of this rule: **an applied migration under
`app/db/migrations/` is frozen, comments included.** Drizzle hashes the whole
`.sql` file, so translating a comment inside one stops the production container
from starting. Leave its
Spanish where it is, whatever this section says; `pnpm check:migration-immutability`
enforces it, and `docs/db/migrations.md` explains why.

`GLOSSARY.md` is the mapping table, keyed on the code identifier: every entry is
the canonical English identifier followed by `ui:`, the Spanish term the user
sees. That direction matches how the table is used — you are writing code, you
have the concept, you need the name and the copy. Reach for it before inventing
a name, and cite it in review when a new identifier disagrees with the glossary.

How to read it:

- The identifier is the root, not the exact signature: decline it as needed
  (`event` → `eventId`, `events`, `loadAdminEvent`, `EventStatusBadge`).
- `comprobante` is the only reserved Spanish term inside code (see
  [Reserved Spanish Domain Terms](#reserved-spanish-domain-terms)).
- **Prose is governed like an identifier**: the `ui:` terms are what the
  user reads, not what a comment, a test name or a design doc says. Write the
  English identifier in prose, and if the surface's own wording is the point,
  mark the Spanish as data, as the next paragraph describes.
- External-system adapters are the exception (see
  [Why Adapters Are Exempt](#why-adapters-are-exempt)).
- Where an existing symbol disagrees with the identifier in the glossary, the
  glossary wins and the symbol is pending rename; renames are tracked separately.
- Retired terms carry no identifier: they must not appear in new code.

Docs quote UI copy verbatim. Spanish inside a quoted string, a route path or a
glossary `ui:` value is data, not prose, and stays Spanish. **Which mark makes it
data depends on the language**, and there is exactly one per language: in code a
double quote marks Spanish copy and a backtick marks a name, because a name has
to nest inside a double-quoted test title; in markdown it is the backtick and
only the backtick, because a double quote there is ordinary punctuation around
ordinary prose. One exception, which would otherwise be circular: the glossary
row's own `— ui: "…"` value is the term the checker parses out of `GLOSSARY.md`,
so it is data by definition.

A name is not translated. `Factura C` and `Nota de crédito C` are what WSFEv1
calls `CbteTipo` 11 and 13, `Proyecciones Artísticas Asociación Civil` is the
issuer's legal name, and `Retirada` is a badge: a translated name names nothing.
Backtick them and move on.

### A `catch` rethrows what it does not expect, or logs before converting

A catch that turns a failure into user copy hides it from everyone else, so it
does one of two things.
**It tests the condition it expects** — an error code, `instanceof`, a refusal
class such as `RecoveryLinkRefusedError` — **and rethrows the rest**, so an
unrelated failure reaches `handleError` and its `[server:unexpected]` line; or
**it logs a tagged line before converting**: `console.error("[area:what]", {
ids, error: describeServerError(thrown) })`, in the family of `[arca:unreachable]`
and `[auth:provider:error]`, with ids and never a request body, document,
email, password or token. A bare `catch {}` needs the expected condition in the
code or a one-line reason, inside the catch or right above its `try`; `pnpm
lint` holds that part (`code/catch-reason`).

### Commits and pull requests are English

**Commit subjects and bodies, PR titles and PR descriptions are English.** They
are engineering prose about the codebase, read by whoever is reviewing or
bisecting it and by no user, so the rule at the top of this section already
decides them the same way it decides comments and ADRs.

The conventional-commit scope names a code area, so it is English too
(`fix(choreographies):`, not `fix(coreografias):`). The exceptions are the ones
that apply to docs: **quoted UI copy stays Spanish**, because a subject or a
description that quotes what the user reads is quoting data, not writing prose
— `fix(ui): replace "roster" with "elenco"` is the correct shape — and a
reserved domain term (`comprobante`) stays Spanish wherever it appears.

History before this rule is mostly Spanish. **That is debt, not precedent**, and
it is not worth rewriting: published history does not get force-pushed to make a
convention retroactive. Write the next one in English.

### Reserved Spanish Domain Terms

Some domain nouns stay Spanish inside identifiers. The full list:

- **`comprobante`** — a term of art defined by ARCA regulation (RG 1415, cited in
  [ADR-0011](../adr/superseded/0011-invoicing-concept-portion-and-surfaces.md)).
  It survives for three reasons. It is a **generic container**: it covers a
  `Factura C` and a `Nota de crédito C` alike, and English has a crisp word for
  each of those and none for the category. The URL is Spanish
  (`app/routes/administracion.comprobantes.tsx`), so the Spanish noun carries
  zero mapping instead of one. And `voucher` is already spoken for by the
  anti-corruption layer below, where it means the WSFEv1 payload; taking it for
  the domain too would collapse the seam that directory exists to keep visible.

  One argument ADR-0011 gives for it does **not** hold, and is recorded here so
  nobody re-derives it: "`voucher` collides with discount vouchers in an app that
  has discounts". There are no discount vouchers. `coupon`, `giftCard` and
  `promoCode` appear nowhere in the tree, and the app's discounts
  (`dancerDiscount`, `administrativeDiscount`) are computed amounts, not
  redeemable instruments. The reasons above are the ones doing the work.

**Growing this list requires an ADR.** An empty reserved list has no escape valve
and breaks quietly; an unbounded one rots back into a mixed codebase.

### Why Adapters Are Exempt

`app/lib/comprobantes/arca` speaks WSFEv1: `ArcaVoucher`, `createVoucher`,
`getLastVoucher`, `buildFacturaCVoucher`. Domain term outside the directory,
protocol term inside — an anti-corruption layer. Adapters keep speaking the
external system's language so the seam between the two vocabularies stays
visible at the directory boundary.

### Surface Prefix Rule

**Unmarked = admin.** Admin is the primary surface, so its symbols carry no
prefix; other surfaces are marked:

- `ChoreographyDetailRouteView` (admin)
- `PortalChoreographyDetailRouteView` (portal)

The justification is _default_, not redundancy removal. "`features/admin/`
already says admin" would argue equally for dropping `Portal`, which we do not
want; the default argument survives a third surface, the redundancy one does not.
The prefix also carries real information: under this rule 8 of the 11 portal
route views would collide by name with an admin counterpart.

Route views on both surfaces now follow the rule: admin ones are English and
unmarked (`ChoreographyDetailRouteView`), portal ones keep the `Portal` prefix,
and admin route default exports match their view root (`ChoreographyDetailRoute`).
Both prefixes are gone from admin domain symbols: types
(`ChoreographyDetailLoaderData`, `PaymentsListLoaderData`), feature view
components (`EventPricesListView`), functions and hooks (`findDancer`,
`useRosterForm`), loaders and handlers (`loadAcademyFinances`,
`handleAcademyDetailAction`), filter and formatting helpers
(`readPaymentsListFilters`, `getPaymentDisplayName`), and constants
(`choreographyFieldNames`, `updatePaymentIntent`).

One set of admin symbols is still marked, and it is not precedent: the `create*`
/ `update*` mutations (`createAdministrativeEvent`) — naming the mutation layer is
a design call, not a mechanical rename; tracked in #526.

`AdminShell`, `AdminResourceLayout` and the other `app/components/admin/` chrome
are a separate case, and the only standing one: they name the admin shell itself,
not a domain symbol on the admin surface, so `Admin` is part of the component's
name rather than a surface prefix. The same reading covers the auth guards
(`requireAdminUser`), the test fixtures that name the acting role
(`createSignedInAdminRequest`) and `getMissingItemAdminPath`, which names an admin
URL. `app/lib/shared/surface-prefix.test.ts` enforces the rule with
`app/components/admin/` as its one declared exception.

The portal layer is only partly marked: 166 exports under `app/lib/portal/` and
`app/features/portal/` still carry no `Portal` prefix. Renames so far marked only
the ones that collided with an admin target name; the rest are an explicit
follow-up. Write new admin symbols unmarked and English, write new portal symbols
marked, and do not cite the existing unmarked portal ones as precedent.

## File Size And Boundaries

Use file size as a maintainability rule that protects module boundaries. The
number is not the design goal; it is the commit gate that forces the design
conversation before a large file lands.

Guideline:

- Keep route, component, and module files under 5500 estimated tokens. Use
  `bytes / 4` as the practical estimate.
- `pnpm check:file-tokens` checks staged application source files and fails
  when a staged `app` module crosses the 5500-token threshold.
- This check is required before committing staged application source, not after
  every implementation pass. Run it earlier when a change materially grows a
  touched app file or when validating a file-size refactor.
- Exclude docs, generated files, lockfiles, and public assets from this rule.
  Use normal review judgment there instead of forcing the same threshold.
- Do not game the number with shallow wrappers. Split when there is a clear
  module boundary that reduces cognitive load for future work.
- Existing large files should be migrated before they are next materially edited.
  If a small emergency fix must touch one, keep the fix narrow and follow with a
  dedicated boundary refactor before continuing feature work in that file.

Good boundaries include:

- loader/action server module
- form controller
- presentational view
- table column definitions
- reusable domain helper
- test fixtures or factory data

Avoid shallow extractions:

- Pulling out a helper that only forwards a few props and leaves the calling
  file with the same branching complexity.
- Creating generic wrappers with many booleans just to shorten one file.
- Splitting server and UI code when they still share one tightly coupled,
  unstable decision surface.

When a file grows past the soft limit and no clear module boundary exists yet,
prefer tightening naming, removing dead branches, and clarifying sections before
creating a forced abstraction.

A file-size refactor validates with [validation.md](validation.md) plus
`pnpm check:file-tokens` on the staged files.

## Loaders and request performance

A loader or action that calls the database or the service layer loads what its
route renders, once:

- Records the caller already loaded are passed in, not re-fetched; a layout loader
  and its child do not both fetch the same event context.
- A route that needs only ids, labels, status flags or counts gets a slim query
  variant, not the full nested data.
- Independent queries run in parallel.
- An expensive helper says so in its name.

When a route, form, table or navigation path feels slow, measure before
diagnosing: time the loader or action at the real route seam, split into auth,
event or context lookup, the main query or mutation, serialization, and
revalidation. Record the route id, the intent, and whether the request came from a
navigation, `useSubmit`, `fetcher.submit` or a native `<Form>`. A revalidation that
follows an action is measured as its own loader, not blamed on the action. Postgres
sits next to the app, so distance to the database is a poor first guess.
