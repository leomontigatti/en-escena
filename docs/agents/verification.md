# Verification

How a session proves a change a user can see, for the shared `implement` skill's step 4. A change
to anything the dev server renders (a route, a component, a loader's output, an action's
feedback) is driven in a real browser before it is reviewed. Skip it for what the browser cannot
exercise: types, tests, tooling, docs, server code with no rendered surface. Never ask the user to
check a screen by hand: drive it and show the result.

## Launch

- **Data** comes from `pnpm db:seed` against the worktree's own database, never from a database
  refreshed from production: screenshots show names and payments, and every asset is public.
  The seed prints the demo accounts and their shared password;
  [local-auth.md](../local-auth.md#demo-data) lists what it creates.
- **The server** is `pnpm dev`, on the worktree's own port, which `pnpm dev:info` prints (the
  examples here say 5173). The first `pnpm dev`, `db:seed` or `db:migrate` in a worktree creates
  its database and port ([local-auth.md](../local-auth.md#one-database-per-worktree)). Run it as a
  background command.
- **A signed-in session**: the demo accounts are `admin`, `academy`, `auditor` and `judge`
  (`admin@enescena.local`, `academia@enescena.local`, `auditoria@enescena.local`,
  `jurado@enescena.local`). Outside T3, `pnpm ui:session <role> <path>` does the whole launch: it
  starts `pnpm dev` in the background when nothing answers on the worktree's port (log in
  `.playwright-cli/dev.log`), seeds a database with no users (one that has users but not the
  role's demo account, such as a production refresh, is refused, never seeded over), signs in
  through `/ingresar` in a `playwright-cli` session named for the role, sized 1440×900, and opens
  the path.

## Doctor

- `pnpm dev:info` reports the worktree's state without opening `.env`, which agents are denied:
  no `.env` means T3's setup script was never imported; `.env` but no `node_modules` means the
  install failed. It also prints the dev port, the database with the `pnpm db:sql` and `psql`
  lines, and which tools the shell reaches.
- "Port … is already in use" from `pnpm dev` usually means your own earlier server is still up:
  `pnpm dev:stop` (§ Cleanup).
- A first load may log `504 (Outdated Optimize Dep)` while Vite pre-bundles; reload once.

## Drive

In a T3 thread, drive with T3's preview tools as the shared `implement` skill's `PREVIEW.md` says,
on the URL § Launch started. Sign in by hand: navigate to `/ingresar`, type the demo account's
email and the seed's password, submit. Size the viewport to 1440×900, the design width in
[style-guide.md](style-guide.md#viewports); when the change touches a table or a dense row, also
check it at 1280×800, the floor.

The preview tools are on trial here (the shared `preview-tools-verification` dependency). This
repo moved to `playwright-cli` because the preview's screenshots blurred mid-animation, it
resized itself off the design width, and its clicks failed when a menu closed in between: wait
for each step's outcome before capturing, re-size before every capture, and note each shortfall
in the final report. When a step cannot be done with the preview tools, finish it with
`playwright-cli` below and say so.

Outside T3, or as that fallback, the browser is the Playwright CLI (`@playwright/cli`, the
`playwright-cli` binary), installed globally with a headless Chromium
([local-auth.md](../local-auth.md#running-locally) has the two commands). If it is missing, stop
and tell the user. Its scratch files go in `.playwright-cli/`, which is gitignored.

1. `pnpm ui:session <role> <path>` (§ Launch). Every later command names the session:
   `playwright-cli -s=academy snapshot`. The login is also saved to
   `.playwright-cli/<role>-state.json`, for `state-load`. Another account is signed in by hand:
   `open` `/ingresar`, `snapshot` for the field refs (they change between snapshots), `fill` the
   email and password, `click` the button.
2. Drive: `goto`, `click`, `fill`, `select`, `press`, and `snapshot` (or `find "<text>"`) to
   confirm the result. Prefer the snapshot for asserting text and structure.
3. Diagnose from the page: `console` for errors, `requests` then `request <n>` or
   `response-body <n>` for the network.

Done when the touched screens show no console error and no React warning: a warning (a missing
`key`, a hydration mismatch) is a finding to fix, or to report on the PR with its reason when it
predates the change. Quote any URL with a `$`-segment route or a query string
(`'http://localhost:5173/portal?evento=…'`) so the shell does not expand it.

## Evidence

A PR that changes what a screen looks like carries before and after images; a change to motion or
interaction a short recording or GIF.

- Capture the **before** during exploration, before the first edit, and the **after** once the
  change is final: same screen, same account, same size (1440×900). With the preview tools that
  is `preview_snapshot` with `save: true`; with `playwright-cli`,
  `screenshot --filename=.playwright-cli/<what>-before.png` (and `-after.png`).
- Name the files `<what>-before.png` and `<what>-after.png`, then run
  `pnpm pr:evidence <pr> <files...>`. It uploads them to the `pr-assets` prerelease (`gh` has no
  attachment upload, and a release asset renders inline) and prints the markdown, pairs already
  laid out as a Before/After table. Paste it under `## Evidence`. Running it again with the same
  file names replaces the assets.
- Motion goes in as a short GIF through the same command. GitHub only gives its video player to
  files uploaded through the browser, so a real video goes in the session's final message as a
  path, and the human drags it into the PR.
- **The repository is public, and so is every asset.** Remove one with
  `gh release delete-asset pr-assets <name>`. Never commit PR-only evidence to the repo.

## Cleanup

Close the browser: `t3_preview_close` for a preview tab, or `playwright-cli -s=<session> close`
(or `close-all`); a `playwright-cli` session left open holds a Chromium for up to an hour. Then
stop the dev server with `pnpm dev:stop`, which finds it by this worktree's port and says
`stopped <pid> on <port>`. It stops only listeners running from this worktree; one from another
directory is left alone and reported, with exit 1. Never `pkill -f`: its pattern matches the
agent's own shell.

## Feature map

Which account and screens prove which area, on the seed's data:

| Area                                                 | Account   | Where                                                                                                      |
| ---------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| Events, catalog, schedules, prices (admin)           | `admin`   | `/administracion`, `Evento Activo`                                                                         |
| Registrations, choreographies, numbering (admin)     | `admin`   | `/administracion`, the active event's choreographies (`Luna de Papel` … `Sal y Arena` in four states)      |
| Finances, payments, comprobantes (admin)             | `admin`   | `/administracion`, `Academia Demo`'s payment and comprobante `9999-00000001`                               |
| Results, presentations, grand final (admin)          | `admin`   | `/administracion`, the afternoon block (`Río Arriba` scored, `Viento Sur` disqualified)                    |
| The academy portal: dancers, registrations, payments | `academy` | `/portal`                                                                                                  |
| An academy with incomplete data                      | by hand   | `academia.antigua@enescena.local`, `/portal`                                                               |
| Judging                                              | `judge`   | `/juzgamiento`                                                                                             |
| The audit (read-only admin)                          | `auditor` | `/administracion`, `/auditoria`                                                                            |
| Sign-in, registration, onboarding, access recovery   | none      | `/ingresar`, `/registro`, `/recuperar-acceso` ([local-auth.md](../local-auth.md#demo-data) lists the flow) |
| An individual's own area                             | by hand   | a `/registro/particular` onboarding, then `/particular`                                                    |
