# Coding Standards

These standards use Matt Pocock's `course-video-manager` Sandcastle standards as
the reference model, adapted to this repo. Keep the principles; add framework-
specific rules only when the repo actually adopts that framework or pattern.

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
| Code identifiers, comments, docs, ADRs | English                          | `loadAdminAcademyFinances`                      |
| External-system adapters               | the external system's vocabulary | `ArcaVoucher`, `createVoucher`                  |

Route filenames are URLs, so they stay Spanish
(`administracion.finanzas_.$academyId.tsx`) while the symbols they export are
English (`loadAdminAcademyFinances`). That mapping is intentional, not drift.

"Docs" means engineering docs — ADRs, `docs/agents/`, `docs/domain/`. The
glossary (`CONTEXT.md`), the repo index (`CLAUDE.md`) and the style guide stay
Spanish: they describe the product vocabulary to a Spanish-speaking team, so
they read as product surface, not as code.

`CONTEXT.md` is the mapping table: every glossary term carries the canonical
code identifier for its Spanish name. Reach for it before inventing a name, and
cite it in review when a new identifier disagrees with the glossary.

### Reserved Spanish Domain Terms

Some domain nouns stay Spanish inside identifiers. The full list:

- **`comprobante`** — a term of art defined by ARCA regulation (RG 1415, cited in
  [ADR-0011](../docs/adr/0011-invoicing-concept-portion-and-surfaces.md)). Every
  English candidate is worse: `voucher` collides with discount vouchers in an app
  that has discounts, and `fiscalDocument` is verbose for a term this frequent.
  The URL stays Spanish regardless, so keeping the Spanish noun carries zero
  mapping instead of one.

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

The justification is *default*, not redundancy removal. "`features/admin/`
already says admin" would argue equally for dropping `Portal`, which we do not
want; the default argument survives a third surface, the redundancy one does not.
The prefix also carries real information: under this rule 8 of the 11 portal
route views would collide by name with an admin counterpart.

Route views on both surfaces now follow the rule: admin ones are English and
unmarked (`ChoreographyDetailRouteView`), portal ones keep the `Portal` prefix,
and admin route default exports match their view root (`ChoreographyDetailRoute`).
The admin server layer does not yet: functions carry an `Admin` prefix
(`loadAdminAcademyFinances`, `loadAdminChoreographyDetailRouteData`) and types
are still marked `Administrative*` (`AdministrativeChoreographyDetailLoaderData`).
The portal layer is only partly marked too: 174 exports under `app/lib/portal/`
and `app/features/portal/` still carry no `Portal` prefix. Those symbols are
pending rename, tracked in #527 — write new admin symbols unmarked and English,
write new portal symbols marked, and do not cite the existing ones as precedent.

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

When validating work around a file-size refactor, use the current repo commands
and order from `docs/agents/workflows.md`, including
`pnpm check:file-tokens`, `pnpm typecheck`, and `pnpm test`.
