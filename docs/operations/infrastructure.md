# Production infrastructure

What runs in production, as current state. The reasoning behind this shape — why
none of it is Supabase anymore — is in
[ADR-0013](../adr/0013-exit-supabase.md); this page does not repeat it.

Everything is co-located in `sa-east` (São Paulo), which is the constraint
ADR-0013 records.

## Host and application

- **VPS**: Hostinger, `72.60.59.2`, reachable as `rylai` over SSH. Its firewall
  is default-deny; see [DNS and email](./dns-and-email.md) for the Cloudflare-only
  `443` rules.
- **Platform**: Coolify.
- **Application**: Coolify resource `x1383fsxfsixpgmvd9quv7tj`, served at
  `sistema.enescena.com.ar`.
- Migrations run from the container entrypoint before the app serves, so a
  failed migration is a container that will not start. See
  [Database migrations](../db/migrations.md).

## Deployment

**Deployment is manual.** Coolify tracks `master`, but nothing deploys on its
own: merging a PR does not release it. A deploy is triggered by hand from the
Coolify dashboard, and it builds whatever `master` points at _at that moment_.

Two consequences worth stating, because both are easy to assume the other way:

- **Merge order and release order are independent.** Work that must not ship
  without a companion change can merge in any order; the gate is the deploy, not
  the merge.
- **`master` being green is not the same as production being current.** The
  running version is whichever commit was last deployed by hand, which may sit
  arbitrarily far behind `master`.

What a deploy does, for reference:

- Builds from `/Dockerfile` (build pack: Dockerfile), then runs
  `node node_modules/@react-router/serve/bin.js ./build/server/index.js` on port
  `3000`.
- Runs migrations from the entrypoint before serving (above).
- Gates on the healthcheck at `/internal/health`: HTTP `200`, 60s start period,
  5s interval, 10 retries.

## Database

- Coolify-managed Postgres, image `postgres:17-alpine`, co-located with the app
  on the same VPS (#267) — app↔database latency is loopback.
- Database name: `enescena`. Every schema lives in it, including `public` and
  `drizzle`.
- `is_public: false`, with **no published port**: there is no route from a
  laptop. Reach it with `ssh rylai` and `docker exec`, not a tunnel.
- No connection pooling: Coolify ships no native pgBouncer, and one gets mounted
  separately only if peak load demands it.
- Backups are configured on the Postgres resource itself, not in this repo. See
  [Backups](./backups.md).

## Storage

- The live byte store is a persistent Coolify volume on the VPS, at
  `STORAGE_VOLUME_DIR` (`/var/lib/en-escena/storage` in production), since #399.
- Bucket directories under it keep the original object keys
  (`academies/...`), so the layout is identical to what B2 held.
- Backblaze B2 is a **backup destination only**. It is not the live store.
- `createSignedUrl` is not an S3 presign: it is a short-lived authenticated
  route that serves the byte from the volume. Nothing is lost to caching,
  because the edge must not cache PII in the first place.
- Dancer documents on this volume are plaintext PII; encryption at rest is
  accepted debt, documented in [Backups](./backups.md#encryption-at-rest-accepted-debt).
- There is **one** storage backend in the app. The Supabase and Backblaze
  in-app adapters were deleted in #571: they had no production caller and only
  made the storage layer read as though a live provider choice existed. The
  adapter seam ADR-0008 asked for is kept, with the filesystem store as its one
  implementation, so a future provider is a new implementation rather than a
  rewrite. The `@aws-sdk/*` packages went with those adapters: B2 is reached
  only by the backup shell scripts, through the `aws s3` CLI, so the application
  bundle carries no S3 client at all.

### Asset-kind policy

Each uploaded asset kind is declared once, in `app/lib/storage/asset-kinds.ts`:
bucket directory, accepted content types with their extensions, size ceiling,
signed-URL lifetime, and the Spanish labels the user copy is built from. The
server validation, the browser `accept` attribute and the messages a user reads
are all **derived** from that declaration, so raising a ceiling is one edit and
cannot leave a surface stating the old number (#571).

Policy violations leave the storage layer as typed rejections
(`unsupported-content-type`, `file-too-large`), not exceptions with matchable
English prose; a single formatter turns a rejection into Spanish. Infrastructure
faults — an unwritable volume, a full disk — stay exceptions, because they are
not something the academy can correct by choosing a different file.

### Choreography music contract

Bucket, formats, size limit and expiry are declared in
`app/lib/storage/asset-kinds.ts` and enforced by
`app/lib/storage/choreography-music.server.ts`; the replacement ordering is
enforced by its caller, `app/lib/portal/choreography-music.server.ts`. Rehomed
here from ADR-0010, which stated the contract against a Supabase bucket that no
longer exists.

- Bucket directory: `en-escena-choreography-music`, private.
- The `Coreografia` row stores only the current storage key, never a URL.
- Accepted formats: MP3, M4A/AAC, WAV and OGG, up to **50 MB**. The limit is a
  product choice about upload sizes, not a plan ceiling.
- Downloads go through a signed URL that expires after **300** seconds.
- Replacement uploads the new object **before** deleting the previous one, so a
  failed upload leaves the existing music intact.
- The row is updated **before** the previous object is deleted, so a failed
  delete leaves that object orphaned on the volume. The replacement still
  succeeds — the academy is not told a save failed when it did not — and the
  orphan is logged as `[storage:music:orphan]` with the key. There is no sweep
  that reclaims it: reconciliation is by hand, from that log line, and it has to
  cover the B2 backup copy as well — see [Backups](./backups.md). The
  divergence from dancer documents (`adapter.remove` there propagates) is
  deliberate: that delete happens before the row is written, so aborting leaves
  the dancer pointing at the document they already had and the failure can be
  reported. A failed delete orphans an object either way — there it is the
  just-uploaded object, here it is the one that was in use.

### Event documents contract

Bucket, format, size limit and expiry are declared in
`app/lib/storage/asset-kinds.ts` and enforced by
`app/lib/storage/event-documents.server.ts`; the row that points at the object
is written by `app/lib/events/event-documents.server.ts`.

- Bucket directory: `en-escena-event-documents`, private.
- Three documents per event — professors contract, minor authorization and adult
  contract — declared once in `app/lib/events/event-documents.ts`. They share a
  single asset kind because they share a single policy.
- Accepted format: PDF only, up to **10 MB**. Downloads go through a signed URL
  that expires after **300** seconds.
- The key is stable per `(eventId, kind)`:
  `events/{eventId}/documents/{kind}.pdf`, uploaded with `upsert: true`. A
  replace overwrites the bytes rather than orphaning them, and the 300s expiry
  makes the "signed link opened before the swap" window negligible.
- These bytes are **not** PII: the same file goes to every academy, so signing
  buys no secrecy. The signed read path is reused because it already exists —
  an unsigned read would mean a second serve route with its own auth decision.
- The signed URL may carry a `filename`, which
  `serveFilesystemObject` echoes as `Content-Disposition: inline; filename=…`.
  The filename is part of the **HMAC payload**: reading it off the query string
  would be a response-header-injection surface. A URL minted without a filename
  keeps its original payload, so existing callers are unaffected.
- A delete removes the row first and the object second. A failed object delete
  leaves an orphan on the volume, logged as `[storage:event-document:orphan]`,
  rather than telling the administration a delete failed after the document
  stopped being offered anywhere.

## Related runbooks

- [Backups](./backups.md) — database and storage backups, restore drills.
- [Database migrations](../db/migrations.md) — how schema changes reach
  production.
- [DNS and email](./dns-and-email.md) — zone, WAF and outbound mail.
