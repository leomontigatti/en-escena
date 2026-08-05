# ADR-0013: Exit Supabase — auth, storage and database

**Status**: accepted

**Supersedes**: ADR-0001, ADR-0005, ADR-0006, ADR-0008, ADR-0010

Date: 2026-08-05

En Escena no longer runs on Supabase. Auth left for Better Auth (#266, #420),
storage left for Backblaze B2 and then for a local volume (#298, #299, #399),
and the database left for a Coolify-managed Postgres co-located with the app
(#267). This ADR records **why**, once, for the whole exit.

It is deliberately a single decision record rather than one amendment per
reversal. The alternative — a new ADR superseding ADR-0006 plus a correction
note on ADR-0001 — would leave three topically identical ADRs of which one is
true, discriminated only by a `Status` field that semantic retrieval does not
honour. That is exactly how the contradiction diagnosed in #625 reached a
session in the first place. `docs/adr/` is append-only, so this half is the
irreversible one: writing the wrong ADR cannot be undone, only superseded.

**This ADR carries rationale only.** What actually runs today —
hosts, resources, buckets, limits — lives in
[docs/operations/infrastructure.md](../operations/infrastructure.md) and must be
read there. An ADR that also carried current state would reproduce the defect
#625 documents.

## Why Supabase was adopted: not recorded

There is no honest answer to "what was the original driver for adopting
Supabase?", and **why Supabase was adopted was never recorded** — so this ADR
states the absence rather than inventing a motive. ADR-0005 opens with "We will
introduce Supabase in two phases", i.e. with the decision already made, and
ADR-0006 argues only sequencing and boundaries. #398 raised the same question as
its open mother question for the same reason.

What _is_ on record is that the lock-in was kept minimal on purpose: auth and
storage sat behind swappable interfaces and no foreign key ever pointed at
`auth.users`. That restraint is why each of these reversals turned out to be
cheap, and it is the part worth carrying forward.

## The exit's actual driver: physical co-location in `sa-east`

The decision recorded in #398 was forced by a latency regression that the B2
storage cutover (#299) exposed — not by cost and not by lock-in. Measured from
Argentina:

| Target             | Connect | TTFB    |
| ------------------ | ------- | ------- |
| B2 `us-east`       | ~175 ms | ~0.65 s |
| Supabase `sa-east` | ~25 ms  | ~0.11 s |

Three facts make **physical co-location in `sa-east`** the dominant constraint
rather than one factor among several:

1. 100% of users are in Argentina.
2. The database sits in the hot path of nearly every SSR request, so every
   cross-region round-trip is paid many times per page.
3. Much of the content is private PII (identity documents) served through signed
   URLs, which the edge/CDN must not cache — so latency is governed by where the
   bytes physically live, not by edge presence.

The bundle chosen was "self-host status quo": VPS + Coolify in São Paulo, with
all state co-located in `sa-east`.

## Auth: Supabase Auth (GoTrue) → Better Auth

Issues #266 and #420; design in #297; a phase of the exit map #293.

Auth carried a hard sequencing precondition of its own: GoTrue lives in the
`auth` schema of Supabase's own Postgres, so auth had to leave GoTrue **before**
the database moved (#267), or it would have been orphaned.

Shape of the move:

- Better Auth adopted whole — catch-all `/api/auth/*` plus its client, with
  `AccessAuthProvider` thinned to what loaders need.
- scrypt native hashing.
- **Reactive** password reset: passwords were not migrated, so each user goes
  through "forgot my password" after cutover.
- Internal users re-pointed faithfully onto the admin plugin.
- Forward-only, with no feature flag.

The safety net was a smoke test with test accounts before announcing, plus
Supabase's 7-day retention as DR — not as rollback.

## Storage: Supabase Storage → B2, then B2 → local volume

Issues #298 and #299, then #399. Two steps, and the second reverses the first.

Storage left Supabase first for Backblaze B2, chosen as a drop-in of the
existing port: `upload` / `remove` / `createSignedUrl` map 1:1 onto S3, and
buckets and keys stayed identical, so no rows had to migrate.

B2 `us-east` was then itself reverted (#399) because it violated co-location —
it is the very regression that triggered #398. Live bytes moved to a persistent
Coolify volume on the São Paulo VPS; `createSignedUrl` stopped being an S3
presign and became a short-lived authenticated route serving the byte from the
volume (no caching is lost, since the edge must not cache PII in the first
place); B2 was demoted to its correct role of backup destination.

Risks accepted with open eyes:

- A single-disk RPO window — up to roughly half a day at 2×/day backups,
  tightened during event windows.
- No HA.

Judged tolerable because documents can be re-requested, and because the app was
already single-VPS, so availability did not get worse.

## Database: Supabase Postgres → Coolify-managed Postgres

Issue #267; design in #300. The last phase of the cutover, the only one with
real downtime, and forward-only with no rollback.

Postgres 17 runs in a Coolify-managed container co-located with the app on the
VPS, for the hot-path reason above: app↔database latency collapses to loopback.
Coolify supplies one-click provisioning, native scheduled backups to B2 and a
restore UI.

Trade-offs accepted:

- Markedly higher ops, in exchange for roughly $0 marginal cost against Supabase
  Pro at $25/month.
- No connection pooling for now — there is no native pgBouncer, so one gets
  mounted separately only if peak load demands it.

## Consequences

- ADR-0001, ADR-0005, ADR-0006, ADR-0008 and ADR-0010 are superseded and point
  here. Nothing is deleted: the rationale in those files is the record the
  append-only rule exists to protect.
- ADR-0010's still-live contract (accepted formats, size limit, signed-URL
  expiry, replacement ordering) moved to
  [docs/operations/infrastructure.md](../operations/infrastructure.md) as
  current state before that ADR was superseded.
- Any future decision that would move state out of `sa-east` has to answer the
  co-location argument above, not just a cost or vendor argument.
