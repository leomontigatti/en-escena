# Plan: migrate from npm to pnpm

This plan describes a controlled migration of En Escena from `npm` to `pnpm` as
its package manager. It is not a prerequisite for speeding up the DB suite, but
it can improve install times, disk usage and consistency with
`mattpocock/course-video-manager`.

Current status: the operational migration uses `pnpm`. Keep this document as a
record of decisions and as a checklist for reviewing future changes related to
installation, lockfiles or automation.

## Goal

Adopt `pnpm` without changing the behavior of the app, the tests or the
validation scripts.

The migration must preserve these repo rules:

- For TypeScript, keep using the project script: `pnpm run typecheck`. Do not use
  `pnpm exec tsc` as direct validation.
- DB tests must keep pointing at `TEST_DATABASE_URL`, never at production or
  preview data.
- Do not mix this migration with code refactors or unnecessary dependency
  changes.

## Expected benefits

- Faster installs thanks to `pnpm`'s global store.
- Lower disk usage on machines with several Node projects.
- Reproducible lockfile with `pnpm-lock.yaml`.
- Stricter dependency resolution, exposing accidental uses of transitive
  dependencies.
- Better operational alignment with `mattpocock/course-video-manager`, which uses
  `pnpm`.

## Risks

- Strict resolution can break imports that work today through accidental
  hoisting.
- Some tools may assume an `npm`-style `node_modules` layout.
- CI, deploy or agents can go stale if they document or run the previous manager's
  commands again.
- The migration can produce large lockfile noise if mixed with dependency
  changes.

## Phase 1: prior audit

1. Confirm the Node version used by the project.
2. Confirm whether `corepack` is available in the development and CI
   environments.
3. Review the files mentioning the previous manager's commands:
   - `AGENTS.md`
   - `docs/agents/workflows.md`
   - `docs/local-auth.md`
   - `package.json`
   - any CI/deploy workflow, if one is added in the future.
4. Identify whether any scripts or tools call the previous manager internally.
5. Run the current baseline validation before migrating:
   - `pnpm format:check`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm test:db` when the DB suite is green on the base branch.

Expected result: a green baseline, or an explicit list of pre-existing failures.

## Phase 2: enable pnpm

1. Choose a pinned `pnpm` version.
2. Add `packageManager` to `package.json`, for example:

   ```json
   {
     "packageManager": "pnpm@10.x.x"
   }
   ```

3. Enable `corepack` in the local documentation:

   ```bash
   corepack enable
   corepack prepare pnpm@10.x.x --activate
   ```

4. Generate `pnpm-lock.yaml`:

   ```bash
   pnpm install
   ```

5. Delete `package-lock.json` in the same change, if the migration is accepted.

## Phase 3: adapt scripts and docs

Update the documented commands:

- install: `pnpm install`
- development: `pnpm dev`
- TypeScript: `pnpm typecheck`
- unit tests: `pnpm test`
- focused DB: `pnpm test:db:file <file>`
- final DB: `pnpm test:db`
- build: `pnpm build`

Keep the TypeScript warning:

- Correct: `pnpm typecheck`
- Incorrect: `pnpm exec tsc`

Update `docs/agents/workflows.md` so the validation order uses `pnpm`.

Update `docs/local-auth.md` for the local install flow.

If historical `npm` references remain in ADRs, do not edit them unless they are
current operational instructions.

## Phase 4: validate compatibility

After installing with `pnpm`, run:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

For DB, when the branch state allows it:

```bash
pnpm test:db:file tests/db/harness.db.test.ts
pnpm test:db
```

If module resolution failures appear:

1. Identify whether the code imports an undeclared transitive dependency.
2. Add the direct dependency to `package.json` only if the project uses it
   directly.
3. Avoid `shamefully-hoist` unless an external tool requires it and the reason is
   documented.

## Phase 5: adapt automation

Once CI/deploy is configured, update it to:

1. Install pnpm with `corepack`.
2. Use a pnpm store cache.
3. Install with:

   ```bash
   pnpm install --frozen-lockfile
   ```

4. Run the equivalent scripts with `pnpm`.

For Codex agents, keep documented persistent approvals for:

- `pnpm test:db:file`
- `pnpm test:db`
- `docker compose up -d postgres`

## Acceptance criteria

- `package-lock.json` was replaced by `pnpm-lock.yaml`.
- `package.json` declares `packageManager`.
- A from-scratch install works with `pnpm install --frozen-lockfile`.
- `pnpm format:check`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass.
- `pnpm test:db:file tests/db/harness.db.test.ts` passes against local Postgres.
- `pnpm test:db` passes, or retains only documented pre-existing failures.
- The operational docs no longer instruct using `npm` for the repo's active
  commands.

## Recommendation

Do this migration on a dedicated branch, with no functional changes. First close
or document the pre-existing DB failures so the migration's final validation is
clear. If the main goal is speeding up tests, treat this migration as a
complementary improvement: the primary lever is still the plan in
`docs/agents/test-suite-speed-plan.md`.
