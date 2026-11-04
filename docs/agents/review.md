# Review

What this repo's risky areas are, for the shared `implement` skill's step 5, the `code-review`
correctness brief and the `pr` skill's § Door. The tier comes from the `review-paths` block
below, read by the shared `review.py` (`implement` step 5, locally) and by the `review-record`
check in CI (`.github/workflows/review-record.yml`), which fails a PR whose `## Review` record
lacks a reviewer its tier requires.

## Full review

A diff that touches any of these goes to the full review (Standards, Spec, and correctness on
both model families):

- **Money**: payments, prices, seminar prices, finances, comprobantes (the documents a payment
  emits), on the admin and on the portal.
- **Results or judging**: scores, judging, votes, results and rankings, the grand final and
  presentations, the audit.
- **Auth**: sign-in, sign-out, password change and recovery, registration, users and permissions,
  the `access` schema.
- **A migration** (`app/db/migrations/`).
- **An operational script that deletes or overwrites**: restores, the staging reset, the local
  refresh from production, the storage reseed and backup, the per-worktree database and the
  worktree sweep, the unexpected-error maintenance and retention jobs, the migrate step and the
  container entrypoint.

A term defined in `GLOSSARY.md` raises the tier too; no path shows it, so the session raises it
by hand, and the check accepts a raised tier.

```review-paths
# Money, by directory, then by file name wherever the module sits with its caller.
full money: ^app/(lib/(finances|prices|seminar-prices|comprobantes|admin/finances)|features/admin/(finances|payments|prices|seminar-prices|comprobantes)|features/portal/(finances|payments))/|^app/routes/[^/]*(finanzas|movimientos|pagos|precios|comprobantes)|^app/db/schema/(finances|prices|comprobantes)\.ts$
full money: ^app/[^ ]*(price|payment|financ|comprobante)
full results or judging: ^app/(lib/(judging|grand-final|presentations)|features/(judging|vote|audit)|features/admin/(results|presentations|grand-final)|features/portal/results)/|^app/routes/[^/]*(resultados|juzgamiento|votar|auditoria|gran-final|presentaciones)|^app/db/schema/(judging|grand-final|presentations)\.ts$
full results or judging: ^app/[^ ]*(score|judg|vote|result|ranking|finalist)|^app/features/portal/presentations/
full auth: ^app/(lib/auth|lib/admin/users|features/admin/users)/|^app/routes/(api\.auth|ingresar|salir|cambiar-contrasena|recuperar-acceso|registro|administracion\.usuarios)|^app/db/schema/access\.ts$
full auth: ^app/[^ ]*(auth|password|permission)
full migration: ^app/db/migrations/
full script that deletes or overwrites: ^scripts/(restore-|staging-reset|refresh-local-db-from-production|reseed-storage|backup-storage|worktree-db|worktree-sweep|unexpected-error-(maintenance|retention)|migrate\.mjs|docker-entrypoint)
both-families
```

`both-families` is the two-family trial: since 2026-10-15 the `full` tier runs correctness on Sol
and on Opus, and each correctness line of the `## Review` record names how many of its findings
the other also found. Around 2026-11-15, or after 15 `full` PRs, read the records back
(`gh pr list --state merged --search '"Tier: full" in:body' --json number,body`) and compare the
fixed findings only one family raised, the declines and the overlap. Then keep both, or drop
`both-families` here.

## Always ask

A finding in these areas that the issue does not settle is the user's call, whatever a triage
pattern says:

- money: payments, prices, finances, `comprobante` emission;
- results or judging;
- auth.

## Hotspots

Where this codebase gets hurt, pasted into the correctness brief:

- amounts that round, split or sum to something other than the total;
- a loader or action reachable by a user who should be refused;
- a second write path (another action, intent or route reaching the same row) missing the authz
  or validation check the first one has;
- a migration the previous container runs against during the deploy;
- state that goes stale after a submit, a revalidation or a navigation; markup that differs
  between the server render and hydration;
- a script that deletes or overwrites (an `rsync --delete`, a reset, a restore) pointed at the
  wrong target or run with an empty variable.

A fix brings its own bugs here too: #1627's race came in with the fix for a correctness finding,
which is why the fix round re-runs correctness over the fixes.

## Breadth

- **Admin and portal.** A behaviour reachable from the admin is usually reachable from the portal
  too, or from a list and its detail. Name the paths you checked and the ones deliberately
  different.
- **Standards.** When the spec and [style-guide.md](style-guide.md) or
  [coding-standards.md](coding-standards.md) disagree, the standard wins unless the spec names the
  exception in so many words.
- **Docs.** Whether the change makes existing guidance wrong, by the
  [documentation rules](workflows.md#documentation), and whether `pnpm check:doc-map` will want
  the mapped page touched.

## One-way doors

Beyond the shared list (a migration that drops or rewrites data, anything that reaches outside the
system, production infrastructure), these are one-way on this repo, however small the diff:

- the contract step of an expand and contract migration
  ([migrations.md](../db/migrations.md#the-exception-mechanism)), or anything the previous
  container cannot run against during the deploy;
- an email sent through Resend;
- writes to payments, prices or comprobantes that reach production data, and any change to how an
  existing comprobante reads;
- Coolify, DNS, secrets, the storage volume.
