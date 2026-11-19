# Coding Standards

These standards started from Matt Pocock's `course-video-manager` standards,
adapted to this repo. They bind every session and every reviewer, human or
agent. Keep the principles; add framework-specific rules only when the repo
actually adopts that framework or pattern.

Framework and library behaviour the code works around is in [stack-gotchas.md](stack-gotchas.md), grouped by library. Transactions, lock orders, constraints and schema traps are in [transactions-and-locks.md](../db/transactions-and-locks.md).

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
shared `tdd` skill. A test never asserts that a
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
  `app/lib/test-support/` holds what any test may want (signed-in requests,
  saved events, academies, forms, the DOM); `app/features/<area>/test-support/` and
  `app/lib/admin/test-support/` hold what one area's tests share.

No other suffix (`*.test-helpers.ts`, `*-test-fixtures.server.db.ts`,
`fixtures.ts`): the documentation gate recognises the `.test-support` suffix
and the directory as test code, and a reader finds every fixture with one
search. Identifiers are English like the rest of the code. Before adding a file, extend
the one that already builds those rows or requests, as the
shared `tdd` skill says; a fixture that a second
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
  [tdd-frontend.md](tdd-frontend.md)), and user
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

A new service that can refuse returns `{ ok: true, … }` or `{ ok: false, reason }`,
with `reason` a short code (`"not-assigned"`, `"format"`) that the caller maps to
user copy; the service itself says nothing a user reads. Existing services keep
the shape they have: this is the convention for new code, not a migration.

Design for testability:

- Accept dependencies instead of constructing external dependencies internally.
- Return values where practical instead of hiding behavior behind side effects.
- Keep public surface area small so behavior is easier to exercise.

- A required prop or field with no default turns an omission into a type error, where a default would quietly pick a branch. The shared money dialog's `targetKind` is required for that reason, and so is a preset inscription's `financialStatus`: without it a waived inscription would be re-priced in the projection. The success notification's list of recategorised choreographies has no default either, and each portal dancer intent names its recategorisation report explicitly.
- A shared module fixes an order, not the names: the seminar field names belong to the repository, and the shared list only sets the order in which refusals are read back.
- Each shared catalogue is declared in one place: the intents a handler answers (its route derives the allowed intents from that list), the rejection copy that persistence and the action layer both read, and the one entry point of a storage module. Adding one is one edit.
- Copy that several callers share lives in a module they can all import without a cycle. A wording built from a lookup that may come back empty falls back to a wording without the name, not to a case.
- A lib that defines a domain kind does not import UI types: the kind's badge variant is a string literal that matches the badge's variants.
- `withdrawnChoreography()` is the complement of the active-rows predicate, for the writes that must reach withdrawn choreographies and only them. Releasing capacity references before a capacity is deleted is the one such write; anywhere else it would strip a live assignment.

## Type assertions

An assertion (`value as T`, `<T>value`) tells the type checker to stop checking,
so a wrong shape gets through silently. Narrow instead: a type guard
(`value is T`), a schema parse where data enters from outside, or a typed helper
that keeps the one check every caller needs. `as const` is not an assertion and
stays.

Lint rejects assertions (`typescript/consistent-type-assertions`, `never`)
everywhere but the files `scripts/type-assertion-allowlist.json` lists, with the
count each may hold; one `.oxlintrc.json` override turns the rule off for exactly
those files. The list only falls. `pnpm check:type-assertions` (pre-commit and
CI) fails when a file's count differs from its entry, when an entry is new or
higher than on `origin/master`, when it cannot read `origin/master`'s list, when
any override exempts a file the list does not hold or misses one it does, and on
a disable comment that names the rule or no rule; the rule takes none. So a
helper that needs a cast to remove many keeps it in a file already on the list,
within that file's entry. A file renamed or moved is a new path to the list, so it
moves without its assertions. To lower an entry, remove the assertions and run
`pnpm check:type-assertions --write` in the same change: it rewrites the counts
and the override from the tree and drops a file at zero.

The ratchet does not count a non-null `!`. An assertion that changes no type, a
needless `!` or cast, is an error under `typescript/no-unnecessary-type-assertion`
in every file lint reads. With `noUncheckedIndexedAccess`
off, `rows[0]` is already non-null, so `rows[0]!` is the usual case.

## React effects

An effect lives in a named hook in `app/hooks/`, never inline in a component or
a route. What an effect would do usually belongs elsewhere: in the event handler
that caused it, in state derived during render, in the route's loader, or, for
markup that must exist first, in a ref callback or `autoFocus`. What is left (a
subscription, a timer, focus after a render a handler cannot reach) is a hook
whose name says what it is for, in `app/hooks/`. shadcn's `app/components/ui/`
keeps its own.

The files that called `useEffect`, `useLayoutEffect` or `useInsertionEffect`
anywhere else when this rule landed are counted in
`scripts/effect-allowlist.json`, and the list only falls.
`pnpm check:effects` (pre-commit and CI) fails when a file's count differs from
its entry, when an entry is new or higher than on `origin/master`, and when it
cannot read `origin/master`'s list. It counts calls through any import from
`react`, aliased, default or namespace. A file renamed or moved is a new path to
the list, so it moves without its effects. When a file's effects move out, run
`pnpm check:effects --write` in the same change to lower its entry.

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

A cleanup on a failure path that itself fails is logged and never replaces the refusal or the error that made the save back out.

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
(`requireAdminPanelWriter`), the test fixtures that name the acting role
(`createSignedInAdminRequest`) and `getMissingItemAdminPath`, which names an admin
URL. `app/lib/shared/surface-prefix.test.ts` enforces the rule with
`app/components/admin/` as its one declared exception.

The portal layer is only partly marked: 166 exports under `app/lib/portal/` and
`app/features/portal/` still carry no `Portal` prefix. Renames so far marked only
the ones that collided with an admin target name; the rest are an explicit
follow-up. Write new admin symbols unmarked and English, write new portal symbols
marked, and do not cite the existing unmarked portal ones as precedent.

## URL state

- A lookup keyed by a value from the URL is a `Map`, not an object, so a key such as `constructor` finds nothing rather than an inherited property.
- Status and origin facets keep English values in code and Spanish values in the address bar; one map per filter is read in both directions. The type facet's value is the kind's own name, so the filter is not tied to its label.
- Retired facet names are not declared, so old links drop them on the way. A legacy spelling of a state is read as that state (`?archivado=si` is read as the suspended state), so a saved link lands on the canonical URL.
- A tab's search and filter parameters belong to that tab. Other tabs reset them, so a stale value cannot come back with the tab.
- On a screen with several tables, each table owns its own parameters: a table without a search box ignores the address bar's search, and a table without pages ignores the page. On a client table a page past the last one resolves to page one; a server-paginated list clamps it to its last page.
- A list's query is the one it is heading to, not the committed URL. A search still navigating is cancelled by clearing it, and a search typed over a filter still navigating keeps that filter.
- The order token `columnId:direction` is split on its last colon, so a column id may itself contain a colon.

## React state and keys

- A keyed element starts over when its key changes, so key stateful views by what they belong to: the detail's tabs by the comprobante id (a note has no tab the invoice's tab could stay on), the vote form by round (a second round starts its values over), and each tab of a list by its own key, so no tab inherits another's state.
- A list that mixes two tables keys each row by its kind and its id, since payments and refunds live in separate tables and the same id can exist in both.
- Local dialog and cell state follows one opening or one loader value. A dialog's picks belong to one opening; a dialog reads its days once when it opens, so a revalidation does not redraw it before it closes; a cell resets to the loader's value whenever the loader changes.
- Do not depend on a value rebuilt on every render. A selection array is keyed by its ids. A price form keys on its schedule ids, because a revalidation hands the same schedules back as a new array. A callback that an effect depends on is kept stable, so the effect does not re-run on every render.
- A dialog's price pick is seeded once, at mount: re-seeding could undo what the administrator picked since.
- Timers, debounces and live ticks read the current value through a ref, not through the closure of the render that created them: the judge's take in the recorder, the live day's minute, a search debounce keyed on the typed value.
- Late async answers are ignored. The banner editor answers only the request still open, so a render that ends after a cancel and a new pick cannot close the new one; leaving the page resolves an open request as a cancel, so its field stops waiting.
- A value read from browser storage or from the viewport waits for mount, because the server render has none of it. The judge's resume marker is placed on each arrival at the list and holds through revalidations; its first placement waits for hydration. The choreography wizard restores its answers in the browser, and the page shows no step until that has run.
- Browser storage is unavailable in a private window or when its quota is full. Those count as no answers. Answers that fail to serialise are a bug and throw.
- Positional lists are keyed by index. The waveform's bars are positions that never reorder.
- A wizard's guard that reads its resolution state in the same commit as a fetcher's result would act on the state from before that result. An unprocessed result therefore makes the guard wait one render. The duplicate-warning object is memoised per server answer, so a re-render does not reopen the dialog.

## Forms and form state

- The first render must show what the server sends back. A refused submission's values are the form's default values, else the saved values, and the effect that corrects the defaults runs after that first render.
- An error a submit has shown is checked again when a value it depends on changes: once a submit has shown the amount's error, a price change re-validates the amount, since the ceiling moved with the pick.
- `isDirty` cannot see a picked file or a photo held by the browser. The page counts it by hand (`hasChanges`). A discard, or a save that stores a new file, remounts the field, so no stale file rides along on the next save.
- Saved and typed values compare by content, in their stored shape (names title-cased, maxima as numbers). A loader hands a new array on every revalidation, and a reference comparison would always read a change.
- A field absent from a submission is not blank: absent means leave stored. The event documents' marker and the schedule's ceremony pair follow that rule. Without it, three absent file inputs would read as "remove all three", and a form posted before a field existed would clear a value saved since.
- A multi-value field whose values can all be removed posts a marker beside them. Without the marker an empty field posts nothing, and the save leaves the picks alone.
- A form posts only what is on screen. A picker the selection no longer offers does not post the pick it held. A checklist draws only the offered subset, so a category no checked modality offers is unchecked in the form itself; a left-behind one would post with no row to uncheck it.
- A switch is a hidden input, so its boolean reaches the action. Its toggle receives the new state, so a side effect fires on one edge only. A flag the server reads as false when absent is posted only when set, as a checkbox would be.
- A form that renders a picture field posts `multipart/form-data` whenever that field renders, since the picture travels with the rest of the body.
- Staged event documents are browser state: a save drops what was staged, keyed by the upload dates so an unrelated revalidation keeps a file the user just chose. The card learns of a pick through the controller's callback.
- Ids from a form are never trusted. A score write names its presentation as well, and the server refuses a score that belongs to another one.
- A tampered submission is refused rather than defaulted, except an unknown criteria kind, which is read as `adds`; the sheet's total rule then judges it. An unknown level is refused, since reading it as the general criteria would overwrite them.
- A bulk run settles each row by the request it sent, never by comparing answers: two requests can answer with the same generic-failure object.
- An action that must work before hydration is a native form, with a raw button inside it. The logout item posts to `/salir` that way.
- A dialog portalled out of a form still sits inside that form in the component tree, so its submit must not reach the form's handler. Otherwise the parent would post again without the dialog's validation.
- A count field keeps the digits typed as a string, so the form's values and the schema's output share one type. The number is parsed off that string.
- A province field is typed as text. Its select starts empty, so the value is text until an option is picked, and the schema refuses any text that is not one of the options.

## Dialogs, menus and popups

- A dialog closed with `open` off stays mounted, so its content survives its exit animation instead of vanishing mid-animation.
- A confirmation with a form submits the form from the click itself, not from a submit button. The click closes the dialog unless the dialog waits on its request. A caller may unmount the form on close, and a browser drops a submission from a form that is no longer in the document.
- A menu item that opens a dialog closes the menu first: the dialog takes focus, and a menu left open behind it would hold it. The dialog a menu item opens is decided when the item is chosen, since the list revalidates after each link is created.
- A delete dialog's details region is the only one that scrolls, so anything in it that must escape its box is clipped unless it portals out, as a popover and a tooltip do.
- A filter picker's tooltip is held shut from the moment the picker opens until the pointer next enters its button, since focus returns to that button when the picker closes.
- A popover trigger's label only focuses the trigger (`labelFocusesOnly`). Activating the label would toggle the popover.
- A search box's clear button hands focus back to its input, so the reader keeps typing.
- A tooltip on a disabled button hangs off a wrapper that still receives pointer events.
- A money dialog sits beside its table, not inside the row that opened it.
- `DiscardChangesDialog` closes when its `open` prop turns false. Its confirm handler does not close it as well: that would report a dismissal, and on a page that resets its blocker before a back, the navigation would go through twice.

## Comboboxes

- A group title is a heading, never an option: it cannot be highlighted, searched or selected. Groups are for lists that mix two kinds of thing a single alphabetical order would interleave. Group labels are unique, since a label is the section's identity. Flat options and groups are mutually exclusive, and the type forbids passing both.
- `ComboboxField` takes its field structurally, so the form's generics do not reach its control.
- The search lives in `ComboboxField`, not in the library, so the clear button empties the search alone and never the chosen value.
- A combobox popup inside a dialog renders into the dialog's portal host. The anchor must be a real element, since the popup positions against it and the host is found from it.
- When a combobox's picker opens, focus goes to its search input (to the popup on a touch, so no keyboard opens). The field id sits on that search input, which exists only while the popup is open.
- A picker that draws from two roster tables carries the person's kind in the option value with the id, since an id alone does not say which table to insert. The section heading is presentation; the value is what the form submits.

## Data tables

- `DataTableShell` owns no state and decides nothing about the data: the client table filters and pages in memory, the server table does it through the URL, and by the time either reaches the shell the rows are the rows to show. Its four regions are separate components, and its props are grouped by the part of the table each one is about.
- The header renderer maps every header group the table returns, although today's column definitions produce one.
- Row selection is lifted to the view when `selectedRowIds` is passed. A selection that drives figures or actions outside the table needs that; otherwise the table keeps its own selection.
- Select-all changes every visible row in one loop, so each change must see the previous result. Controlled selection goes through a ref for that reason.
- `renderFilteredSummary` draws over every filtered page, so figures that sum what the reader sees follow each filter. A server table's filtered count is the page the loader sent, since no client filter narrows either number.
- Both tables register one feature list. The server table switches the client row models off with its manual flags, since the loader has already searched, sorted and paged the rows.
- A table with no page controls is not paged: every row is on screen. The page in the address bar belongs to the screen, so such a table leaves it alone. The address bar owns the page reset.
- Filter and sort state re-seed only when their values change, not when the object identity changes: admin lists build their initial values inline on every render, and a re-seed would put back the old filters while the loader answers.
- The optional props of a table are defaulted by one helper outside the component, since they are defaults and nothing else. The helper runs on every render.
- A row can be reordered without a pointer: the keyboard sensor is what makes the move reachable.
- Server table search keeps a queue of the searches it navigated with, oldest first. A search arriving from the address bar that is found in the queue is its own echo and is ignored. Anything else (Back, a shared link, a view resetting its filters) is an outside change, and the box adopts it. The typed value decides its own surrounding spaces, since the URL records the search trimmed.
- The text filter narrows one named column and leaves the global filter out; without one, the search box is the global filter. It is derived from the search rather than stored, so a search arriving from the address bar filters the rows the same way.
- A `matchesSearch` predicate, when given, judges the whole row and replaces the columns' filter values and the text filter column.
- A column's internal id is English unless the column sorts. A new sortable column's id is the order token the list writes in the URL (`nombre:desc`), and URLs are Spanish; some older client tables still sort by an English id (`scheduledAt`).

## Measured layouts and text fit

- A folded badge stays in the DOM, out of flow, so it can be measured again. The row is measured again after each fold until the count settles, since the counter's own width changes with its number.
- A choice card is `relative`, because its hidden form input is positioned absolutely. Anchored further out, the inputs of rows scrolled out of a long list would stretch the page.
- Truncated text is measured again once web fonts have loaded.
- Each name on a print pass is fitted in the browser after Montserrat has loaded: it shrinks from 14 pt to 7 pt by quarter points, and a word too long for the line breaks only as a last resort. The fallback font's widths would fit the wrong text, and only the browser can measure text.

## Input fields

- In a birth-date field, a backspace right after a slash also takes the digit before it. Deleting the slash alone would leave the digits as they were, and the mask would put the slash straight back.
- An integer input's suffix is decoration: it is `aria-hidden`, unselectable and never submitted, so the label must carry the unit. It sits over an invisible copy of the typed value with the same font and padding, so no measurement is needed.
- In the judge's score field, a keystroke the field rewrites puts the caret back, or the judge's next Backspace removes the wrong digit.

## Media and files

- An audio preview sits outside the picker's dropzone, because a player inside the picker's label would open the picker on play. A new file gets a new player keyed by its URL. The picker stays mounted, hidden, while a player shows, since a picked file is submitted through its input.
- A stored song is saved rather than opened, so the browser's player does not open in a new tab.
- A kept file is restored into the file input as described in [stack-gotchas.md](stack-gotchas.md#browsers-files-and-forms), so the form submits it.
- Audio playback follows the element's position every frame while it plays. Audio loads only its metadata by default, since a song is too big to load with every page. A caller passes the length it decoded as `durationMs` for audio that reports none.
- A recorder owns and revokes every object URL it creates for a take, never the stored URL, which is the server's. A judge re-records on a tablet that stays open all day, so a dropped take must be let go.
- A save tapped while the recorder still hands over the take waits for it. Unmounting mid-take drops the take, since nothing is left to receive it.
- A carousel's second picture waits until the first has settled, loaded or failed, so the rest load ahead of autoplay.
- A banner picture is previewed as the upload will be stored: the upload is a JPEG, so a transparent photo is painted white in the preview as it will be in the banner.

## Numbers and rounding

- Vote shares round in integer tenths before the float division, so 2 of 3 reads 66.7.
- A check against a decimal step (a judge's half point) runs in tenths. Binary floating point cannot hold decimal steps exactly, and a valid half point must never be refused by arithmetic.
- A shape tolerance compares whole pixels, so a picture exactly at the tolerance is not refused by a rounding error.
- Choreography names keep a leading letter whose capital is more than one character (`ß`) as it is, since capitalised its stored form would change again on its next save. The shared `toTitleCase` does not: it turns a leading `ß` into `SS`, and the next save turns that into `Ss`.

## Dates and times

- A business date is `AAAA-MM-DD` text. It is read as the local midnight of that day, so the calendar and the floor compare the same day.
- A date-only value must pass a value check, not only a shape check: `2026-13-40` has the shape and is no date, and converting it to ISO throws. A printed day is formatted only after its shape is checked as a date, so a bad stored value falls back to the stored text instead of taking the route down.
- Day, month and year typed the Argentine way are read from their parts, never by parsing the text as a date. Two-digit years are refused, since any century would be a guess and a wrong guess is a wrong age. Impossible dates are refused by round-tripping them.
- "Today" has one owner, `getBusinessDateOnly()`. The server runs in UTC, so a `new Date()` would advance the day hours early in the business time zone.
- Date-only strings compare as text: the age bounds are computed as date-only strings. The ceiling names the first refused date, not the last accepted one, and a computed 29 February keeps its day, since it still sorts exactly at the real boundary.
- Registration readiness is calculated from one instant and stamped with the business day, not UTC. A cached result expires at business midnight even when nothing was written, since a price can expire by the passage of time alone.
- A live view's first render reads the loader's clock, not the browser's, so the server and the browser render the same opening tab and badge whatever the browser's clock says. The browser's own clock takes over after hydration.

## Enums and sets

- The stored form of an experience-level set is sorted in the enum's declaration order, on the way in. Comparing the stored and the typed set in order is then an equality of sets, so a write that stored the set unsorted would break that.
- The presentation order of experience levels is written out in code, not read from the pg enum: the enum's declaration order cannot be reordered without recreating the type.
- A price's schedule ids are deduplicated and sorted on the way in, so two inputs naming the same schedules compare equal.
- The seminar kind is a closed set. An unreadable value falls back to the default rather than reaching the schema as a free string.

## Shared rules for previews and writes

- The view reads a draft's preview, and the save writes from the same resolution. Both go through the classification path that registration uses, and classification runs only when the modality or the dancers changed.
- The schedule options are the compatible capacities minus the ones that would reprice a money-holding inscription. That is the same split the save's guard makes. The assigned capacity is exempt, and while the classification is unchanged it is offered even when it is no longer compatible.
- The modality options the view offers are exactly the ones the intent accepts, and the ones it renders disabled are exactly the ones it rejects.
- An unanswered draft field is an empty string, as in the form: a select with nothing chosen, or a capacity the resolution left to pick.
- The price-divergence check loads a choreography's inscriptions, event and price rows once, and answers every destination from that read. The offered options and the guard therefore use one rule and one shared read for every destination.
- The placement columns are written only when the draft re-resolved them, so an unchanged placement is never rewritten.
- The capacity, deletion and modality blockers share one shape: the server writes the code and the label that gets read, and the view only lists them in the page alert.

## Modules and boundaries

- Env-dependent singletons initialise on first use, not on import. A test that only imports the database module needs no database, and a missing production secret fails on the first request instead of at server startup.
- Types that a client module needs live in a module the client can import: the download-URL type sits in the client-safe event-documents module, so the portal menu can type its props without importing a `.server` module.
- The ARCA client depends on a minimal port, the WSFEv1 surface it uses, and takes its timeouts by injection. Tests exercise the client against fixtures and shrink the timeouts to milliseconds, with no network and no real `Arca`.
- `updateEvent` is the only path that changes an event's structural fields, `requiredDepositPercentage` among them, so no second writer can bypass the operational-dependency guard. A test pins that.
- Only bases edits dirty an event's cached registration readiness. Opening or closing an inscriptions switch changes no bases: readiness measures configuration, not availability.

## External services

- ARCA responses are normalised to one message shape before the app reads them.
- The ARCA comprobante type (`cbteTipo`) is read only through the comprobante kind helpers, never as the raw integer.
- A contingency view's failure reason admits any string, but the four reasons that map are compared against the emitter's union type. Renaming one there breaks the build here, instead of silently degrading to a generic error.

## Errors and logs

- A log names the operation and never the payload: a sign-up parse error quotes the email, so it is named, not described.
- Describing an error in a report must not throw: anything can be thrown, including a value that cannot be converted to a string.
- A stored seminar inscription row that names two people, or none, is a programming error. Reading one throws rather than returning a guess.

## Print and exports

- Phone numbers are written as text, so a leading zero survives the spreadsheet.
- A seminar export's sheet name is cleaned by its naming helper before the writer uses it. A name that cleans to nothing becomes `Seminario`, de-duplicated like any other, rather than the writer's default, which could repeat another sheet's.
- Dancer names in the choreography export are sorted by surname compared as Spanish (`es-AR`), so an accented surname sorts with its letter. A withdrawn inscription is marked as such in the names.

## Navigation and transitions

- The record title's view transition pairs only the link a navigation targets with the page it opened. A page title is marked only when the row link that opened it recorded that in the location state. A marked page title yields to a marked link on its own page, since a detail page can hold rows of other records.

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

### Consistent reads

- A loader reads each set once and answers every reading from that read. Readings that must agree share one instant, so `now` is taken once.
- A participation export's three sheets read the inscriptions once, so they count the same set even while inscriptions change. A registration that lands between the reads has no figures yet and is left out of every sheet alike.
- The list filters run their facet comparisons before the search, since the facets are a few comparisons and the search normalises strings. Rows the facets already ruled out never reach the search. Numbers are unique within an event, so ordering by number never ties and needs no second criterion.
- A loader trims what it sends a dialog to what the dialog projects. The dialog's slice of an inscription carries the figures it derives and what it takes to re-derive them against another price; who the dancer is and how the row is badged are the list's business.
- The bulk evaluation-lock check takes many choreographies at once. A sweep over a dancer's choreographies asks it once, not once per row.

### Revalidation

- A route names its faceted filter parameters for the revalidation rule, taking the list the view exports. A group left out costs one unnecessary reload, never a wrong result. A browser-paginated table's route skips the reload for its own parameters; a server-paginated route does not adopt the rule, since its query string is the query.
- A refused save comes back as data and changes nothing the loader reads, so the route does not reload for it. A save that leaves the page needs no reload either.
- On list pages whose day tab and search only narrow a list that is already whole in the browser, nothing reloads.

### Polled pages

- The audit page polls every ten seconds, only while the round may still change. A closed round or a refused link has nothing more to show. A hidden audit page does not poll and asks as soon as it is seen again. A load still on its way is let finish, so a slow connection is not cut off. The live program polls every minute, and only when its day is live or a new program day has begun; it has no hidden-page or in-flight guard.
- A poll goes through a fetcher, not the revalidator: the revalidator reloads root data too, so one failed root load would trade the page for the error boundary. A failed poll keeps the data on screen.
- What the last poll brought decides whether the audit page is still live. A poll that finds the link revoked drops its cookie, and one more poll would read as a browser that never opened a link.

### Short-lived in-process caches

- `cacheFor` answers from memory for a short time after a load finishes. Reads that arrive during a load share it, and a failed load is not kept.
- These caches live in one process. That is enough while production runs one app process, since a second process would only load twice as often. The audit totals are cached for five seconds, and the public program for twenty seconds in memory and in the browser, so an audience's reloads and the live tab's polls cost a few program reads a minute. Each request still reads its own session, and a signed-in reader's role, uncached.

### Sessions and private pages

- The signed-in voter is read from the cookie alone, with no database read, so a request with no valid sign-in is turned away before it costs a query.
- The audit page sends `no-store`, a `no-referrer` policy and a `noindex` robots tag: it holds a bearer secret and totals nobody else may see. The vote page and the admin audit-link answer send `no-store` too, the vote page because it holds the visitor's code.
- The public program is `private` with a browser cache window matching the server's, not `no-store`: the top bar follows the reader's own session, so no shared cache may hand the page to someone else.
- An action's headers replace the loader's when the action sets `Cache-Control`, so a created audit link's answer carries `no-store` once.

### Sign-in starts

- A sign-in starts only from the vote page's form, never from a link a browser might prefetch. A plain visit to the sign-in URL goes back to the page.
- Sign-in with Google is a plain form, so the browser follows the redirect as a page, and nothing prefetches it.

### Request bodies

- A request body is read up to the cap whatever `Content-Length` claims. A chunked body has none, and a declared length can lie.
- A body that is not a form is a 400 that the boundary renders, not an unexpected error. Reading a body twice is a bug in the app, and is reported as one.
