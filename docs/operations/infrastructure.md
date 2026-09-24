# Production infrastructure

What runs in production, as current state. The reasoning behind this shape — why
none of it is Supabase anymore — is in
[ADR-0013](../adr/0013-exit-supabase.md); this page does not repeat it.

Everything is co-located in `sa-east` (São Paulo), which is the constraint
ADR-0013 records.

## Host and application

- **VPS**: Hostinger, `72.60.59.2`, reachable as `rylai` over SSH. Its firewall
  is default-deny; see [DNS and email](./dns-and-email.md) for the Cloudflare-only
  `443` rules. `ufw` is **inactive** on the host, so that filtering is
  Hostinger's network firewall (group `default`), configured in hPanel —
  reading the host's own rules will tell you nothing. SSH is accepted only from
  the control plane and the operator's current IP, `80` from anywhere, `443`
  only from Cloudflare's IPv4 ranges, and there is no UDP rule at all.
- **Platform**: Coolify, but `rylai` runs only the agent side of it:
  `coolify-sentinel` and the `coolify-proxy` Traefik container. The dashboard is
  on a different machine — see [Coolify control plane](#coolify-control-plane).
- **Application**: Coolify resource `x1383fsxfsixpgmvd9quv7tj`, served at
  `sistema.enescena.com.ar`.
- Migrations run from the container entrypoint before the app serves, so a
  failed migration is a container that will not start. See
  [Database migrations](../db/migrations.md).

### Coolify control plane

The Coolify dashboard does **not** run on `rylai`. It is a second Hostinger VPS,
`2.25.160.145` (`srv1723917.hstgr.cloud`), and `rylai` is a server it manages.
Anything that means "open Coolify" — triggering a deploy, restarting the proxy,
calling the API — happens there; everything the application serves happens on
`rylai`.

The control plane is not specific to En Escena: it is meant to host other
projects too, which is why its domain is not under `enescena.com.ar`.

Two consequences, both easy to get wrong:

- **Losing the control plane does not take the site down.** `rylai` keeps
  serving on its own. What is lost is every way to deploy, restart or inspect it
  from the UI, which makes the control plane an availability dependency for
  _changing_ production, not for running it.
- **There are two firewalls, not one.** Each VPS carries its own hPanel rule
  set, and a change made for one does not apply to the other.

#### Dashboard domain

The dashboard is served at `https://panel.underthing.dev`, the instance URL
under `Settings > Configuration > General > URL`. The `underthing.dev` zone
lives in a **different Cloudflare account** from `enescena.com.ar`, on purpose:
the business's domain stays with the business, and the platform's stays with
its operator. An API token from one account cannot see the other's zone.

`panel` is an `A` record to `2.25.160.145`, **DNS only**, and the control
plane's own `coolify-proxy` (Traefik, `3.7.13` as of 2026-09-17) terminates TLS
with a Let's Encrypt certificate. Realtime updates (`/app`) and the web terminal
(`/terminal/ws`) are routed through that same `443`, which is what lets `6001`
and `6002` stay closed.

API tokens issued while the dashboard was plain HTTP were rotated on
2026-09-17, after the move.

#### Control plane firewall

The group is `coolify-server`, attached on 2026-09-16; until then the VPS had no
network firewall at all. It accepts:

| Port        | From                      |
| ----------- | ------------------------- |
| `22`        | the operator's current IP |
| `80`, `443` | anywhere                  |

Nothing else is open. Coolify documents `8000`, `6001` and `6002` for a
dashboard reached by IP; with the domain in place they have been closed since
2026-09-17. Nothing in the platform needs UDP.

**A change of the operator's IP locks out SSH and the REST API, not the
dashboard**: `443` is open to anywhere, and the Coolify MCP endpoint is not
gated by the API allowlist. Recovery is in hPanel, which does not go through
this firewall — update the `coolify-server` SSH rule — plus the instance's
`Allowed IPs for API Access` under `Settings > Configuration > Advanced`.

#### Sentinel follows its own URL, not the instance URL

`coolify-sentinel` on a managed server pushes to that server's
`sentinel_custom_url`, and Coolify **saves** the value the first time it
generates it. Changing the instance URL afterwards does not move the agents: in
Coolify `4.3.21`, `ServerSetting::ensureSentinelUrl()` only regenerates the URL
when it is blank. Set it per server with
`PATCH /api/v1/servers/{uuid}/sentinel` and a new `sentinel_custom_url`; Coolify
restarts the agent when that value changes.

`rylai` pushes to `https://panel.underthing.dev`. Check it from the host:

```bash
ssh rylai 'docker inspect coolify-sentinel --format "{{range .Config.Env}}{{println .}}{{end}}" | grep PUSH_ENDPOINT'
```

The control plane's own agent pushes to `http://host.docker.internal:8000`,
which stays on the Docker network and never meets the firewall.

#### Known gaps

- **The login page is public.** `443` is open to anywhere, so the gate is the
  Coolify login itself. Putting `panel` behind Cloudflare's proxy with a WAF
  rule that admits only the operator's IP would narrow it; that is not done.
- **The GitHub App's webhook URL is most likely stale.** The private
  `en-escena` GitHub App was set up while the dashboard was reached by IP, so
  its webhook presumably still targets `http://2.25.160.145:8000`, which is now
  closed. This is not verified — the setting lives on GitHub. Deploys are
  manual, so nothing depends on it; update it before turning on automatic
  deployments or pull request previews.

### Proxy

On `rylai`, `coolify-proxy` is Traefik, pinned in
`/data/coolify/proxy/docker-compose.yml`
to the **floating** `traefik:v3.7` tag. A patch update is a pull and a recreate
with no file edit; the flip side is that the compose file does not record which
patch is running, so read it from the container rather than the config:

```bash
ssh rylai 'docker exec coolify-proxy traefik version'
```

Running `3.7.13` as of 2026-09-16, updated from `3.7.10` for the CVEs fixed
across `3.7.11`, `3.7.12` and `3.7.13`.

Coolify regenerates that compose file, so proxy flags belong in the dashboard
under `Servers > <server> > Proxy > Configuration`, never in a hand edit on the
host — the next regeneration would silently drop it.
`/data/coolify/proxy/backups/` keeps the previously generated copies, and
`acme.json` sits on the same bind mount, which is why recreating the proxy does
not re-issue certificates.

The `https` entrypoint has HTTP/3 enabled (`--entrypoints.https.http3`, with
`443:443/udp` published). In practice nothing should arrive on it: Cloudflare
does not speak HTTP/3 to an origin, so the only client that could reach it is
one addressing the IP directly — and `rylai`'s firewall has no UDP rule, so
that client is dropped before it reaches Traefik.

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
- A delete removes the object first and the row second. A failed object delete
  aborts before the row is touched, so the document stays offered and the
  administration can retry; `removeDocument` tolerates an object that is already
  absent, so the retry converges. The other order reports success over bytes
  that survived, which is the one outcome "eliminar" must not mean.

### Seminar instructor picture contract

Bucket, formats, size limit and expiry are declared in
`app/lib/storage/asset-kinds.ts` and enforced by
`app/lib/storage/seminar-pictures.server.ts`; the row that points at the object
is written by `app/lib/seminars/repository.server.ts`, from the seminar detail's
own "Guardar".

- Bucket directory: `enescena-seminar-pictures`, private. The name deliberately
  drops the `en-escena-` prefix the other three carry: nothing globs on the
  prefix, and every bucket name is pinned by `asset-kinds.test.ts` anyway.
- Accepted formats: JPG, PNG and WEBP, up to **10 MB**. Downloads go through a
  signed URL that expires after **300** seconds. There is no thumbnail and no
  derived variant: the original is served and sized by CSS.
- One object per seminar, at
  `events/{eventId}/seminars/{seminarId}/instructor.{ext}`. The row holds that
  key, never a URL.
- A replace uploads the new object **before** removing any sibling under the
  seminar's prefix with another extension, so a JPG replaced by a PNG leaves
  exactly one object. The removal propagates, as it does for dancer documents:
  the row is written only afterwards, so a failure leaves the seminar pointing
  at the picture it already had.
- A removal deletes the object first and nulls the key second, and
  `removeInstructorPicture` tolerates an object that is already gone, so a retry
  converges. Deleting the seminar removes the object the same way.
- Deleting the **event** orphans the object, exactly as it orphans event
  documents today. Cleaning storage orphans on event deletion is a separate
  issue that has to cover both.

### `Devolución` audio contract

Bucket, format, size limit and expiry are declared in
`app/lib/storage/asset-kinds.ts` and enforced by
`app/lib/storage/feedback-audio.server.ts`; the row that points at the object is
written by `app/lib/judging/save-score.server.ts`, from the judge's own save.

- Bucket directory: `en-escena-feedback-audio`, private.
- Accepted format: `audio/webm` only, up to **10 MB**. The only producer is the
  in-browser recorder, which emits `audio/webm;codecs=opus`, so the
  codec-qualified string is accepted alongside the bare one — that is what a
  real take arrives as. Downloads go through a signed URL that expires after
  **300** seconds.
- One object per upload, at
  `events/{eventId}/presentations/{presentationId}/judges/{judgeId}/devolucion-{unique}.webm`.
  The key is deliberately **not** stable per judge: the replacement is written
  before the take it replaces is removed, so a stable key would have the removal
  delete the audio that had just been saved. The `score` row holds that key,
  never a URL.
- The upload happens **inside** the save's transaction, before the score is
  written: a failed upload aborts the whole save, so no score ever points at an
  object that does not exist.
- On a replace or a remove, the previous object is deleted only **after** the
  transaction commits, so a rolled-back save never loses stored audio. A failed
  delete leaves that object orphaned on the volume and logs
  `[storage:feedback-audio:orphan]` with the key — the save still succeeds,
  because the row already points elsewhere and the judge must not be told their
  score was lost. There is no sweep that reclaims it; reconciliation is by hand,
  from that log line, and it has to cover the B2 backup copy as well — see
  [Backups](./backups.md).
- `serveFilesystemObject` has **no Range support**. The player never seeks, so
  none is needed; a scrubber may not be added without it.
- The bucket is backed up only because it is named in `STORAGE_BACKUP_BUCKETS`,
  which production sets and the backup scripts default — see
  [Backups](./backups.md#required-environment). A show's audio is all recorded in
  one evening, so the base twice-a-day cadence is raised for the event days.
  Adding the bucket to the production variable is a
  [pending manual step](./backups.md#pending-production-step-before-the-october-event).

## Related runbooks

- [Backups](./backups.md) — database and storage backups, restore drills.
- [Database migrations](../db/migrations.md) — how schema changes reach
  production.
- [DNS and email](./dns-and-email.md) — zone, WAF and outbound mail.
