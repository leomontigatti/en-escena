# Verification

How a session proves a change a user can see, for the shared `implement` skill's step 4. A change
to anything the dev server renders (a route, a component, a loader's output, an action's
feedback) is driven in a real browser before it is reviewed. Skip it for what the browser cannot
exercise: types, tests, tooling, docs, server code with no rendered surface. Never ask the user to
check a screen by hand: drive it and show the result.

## Launch

- **Data** comes from `pnpm db:seed` against the worktree's own database, never from a database
  refreshed from production: screenshots show real people's names and payments.
  The seed prints the demo accounts and their shared password;
  [local-auth.md](../local-auth.md#demo-data) lists what it creates.
- **The server** is `pnpm dev`, on the worktree's own port, which `pnpm dev:info` prints (the
  examples here say 5173). The first `pnpm dev`, `db:seed` or `db:migrate` in a worktree creates
  its database and port ([local-auth.md](../local-auth.md#one-database-per-worktree)), so read the
  port after that first command: before it, `pnpm dev:info` prints the default. Run it as a
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
  lines, the storage folder uploads go to, and which tools the shell reaches.
- "Port … is already in use" from `pnpm dev` usually means your own earlier server is still up:
  `pnpm dev:stop` (§ Cleanup).
- A first load may log `504 (Outdated Optimize Dep)` while Vite pre-bundles; reload once.

## Drive

In a T3 thread, drive with T3's preview tools as the shared `implement` skill's `PREVIEW.md` says,
on the URL § Launch started. Sign in by hand: navigate to `/ingresar`, type the demo account's
email and the seed's password, submit. Size the viewport to 1440×900, the design width in
[style-guide.md](style-guide.md#viewports), once: it holds across navigations and sign-ins. When
the change touches a table or a dense row, also check it at 1280×800, the floor. The admin
sidebar fills most of the snapshot's tree, so target a popover's items by role locator, and wait
for text the main content shows (a sidebar label such as `Resultados` matches before the page
loads).

The preview tools are on trial (the shared `preview-tools-verification` dependency). Since the
2026-10-16 probe they drive, assert, read the console and record reliably here, but their
captures cannot be evidence: they save at 1280×800, shrinking the 1440×900 viewport, and draw
the blurred backdrop behind every dialog and sheet as mirrored tiles. Before and after images
therefore come from `playwright-cli` (§ Evidence). When a step cannot be done with the preview tools, finish it
with `playwright-cli` below and say so in the final report.

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

A change to what a screen looks like is shown as before and after images; a change to motion or
interaction as a short recording.

- Capture the **before** during exploration, before the first edit, and the **after** once the
  change is final: same screen, same account, same size (1440×900), both with `playwright-cli`
  (`pnpm ui:session <role> <path>`, then
  `screenshot --filename=.playwright-cli/<what>-before.png`, and `-after.png`), even in a T3
  thread: the preview's captures are not evidence here (§ Drive). A recording can come from
  `preview_recording_start` and `preview_recording_stop`.
- Show them to the user in the thread for approval before the PR opens (the `implement` skill's
  step 7): embed each file by its absolute path, `<worktree>/.playwright-cli/<what>-after.png`.
  `.playwright-cli/` is gitignored, so the images never reach the repo or the PR.

## Cleanup

Close the browser: `t3_preview_close` for a preview tab, or `playwright-cli -s=<session> close`
(or `close-all`); a `playwright-cli` session left open holds a Chromium for up to an hour. Then
stop the dev server with `pnpm dev:stop`, which finds it by this worktree's port and says
`stopped <pid> on <port>`. It stops only listeners running from this worktree; one from another
directory is left alone and reported, with exit 1. Never `pkill -f`: its pattern matches the
agent's own shell.

## Feature map

Which account and screens prove which area, on the seed's data:

| Area                                                 | Account   | Where                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Events, catalog, schedules, prices (admin)           | `admin`   | `/administracion`, `Evento Activo`                                                                                                                                                                                                                                                                   |
| Registrations, choreographies, numbering (admin)     | `admin`   | `/administracion` › `Coreografías`: `Estado` reads `Completa` on `Luna de Papel`, `Viento Sur` and `Río Arriba` (music loaded), `Incompleta` on `Sal y Arena` (no music: the portal detail reads `Falta cargar archivo de música`), and `Retirada` on `Marea Alta`, under the `Retirada` filter only |
| Finances, payments, comprobantes (admin)             | `admin`   | `/administracion`, `Academia Demo`'s payment and comprobante `9999-00000001`                                                                                                                                                                                                                         |
| Results, presentations, grand final (admin)          | `admin`   | `/administracion`, the afternoon block (`Río Arriba` scored, `Viento Sur` disqualified)                                                                                                                                                                                                              |
| The academy portal: dancers, registrations, payments | `academy` | `/portal`                                                                                                                                                                                                                                                                                            |
| An academy with incomplete data                      | by hand   | `academia.antigua@enescena.local`, `/portal`                                                                                                                                                                                                                                                         |
| Judging                                              | `judge`   | `/juzgamiento`                                                                                                                                                                                                                                                                                       |
| The audit (read-only admin)                          | `auditor` | `/administracion`, `/auditoria`                                                                                                                                                                                                                                                                      |
| Sign-in, registration, onboarding, access recovery   | none      | `/ingresar`, `/registro`, `/recuperar-acceso` ([local-auth.md](../local-auth.md#demo-data) lists the flow)                                                                                                                                                                                           |
| An individual's own area                             | by hand   | a `/registro/particular` onboarding, then `/particular`                                                                                                                                                                                                                                              |
