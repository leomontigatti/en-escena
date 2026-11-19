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
  reading the host's own rules will tell you nothing. `80` is accepted from
  anywhere and `443` only from Cloudflare's IPv4 ranges; there is no `22` rule
  and no UDP rule at all. SSH, the operator's and Coolify's, comes in over
  Tailscale: see [Operator access](#operator-access).
- **Platform**: Coolify, but `rylai` runs only the agent side of it:
  `coolify-sentinel` and the `coolify-proxy` Traefik container. The dashboard is
  on a different machine — see [Coolify control plane](#coolify-control-plane).
- **Application**: Coolify resource `x1383fsxfsixpgmvd9quv7tj`, served at
  `sistema.enescena.com.ar`.
- **Staging**, a second deployment on production data for specific tests, runs
  on `rylai` too, in its own Coolify environment: see [Staging](./staging.md).
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

| Port        | From     |
| ----------- | -------- |
| `80`, `443` | anywhere |

Nothing else is open, `22` included: SSH to the control plane exists only over
Tailscale ([Operator access](#operator-access)). Coolify documents `8000`, `6001` and `6002` for a
dashboard reached by IP; with the domain in place they have been closed since
2026-09-17. Nothing in the platform needs UDP.

**A device missing from the API allowlist is locked out of the REST API, and
nothing else**: SSH does not depend on it, and `443` is open to anywhere. The
fix is the instance's `Allowed IPs for API Access` under
`Settings > Configuration > Advanced`.

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
ssh root@rylai 'docker inspect coolify-sentinel --format "{{range .Config.Env}}{{println .}}{{end}}" | grep PUSH_ENDPOINT'
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

### Operator access

How anyone, Coolify included, gets a shell on either VPS lives in the operator's
private [`infra` repository](https://github.com/leomontigatti/infra), checked out
at `~/.t3/projects/infra`: the access model, the tailnet policy, a new device's
first login and each host's state. Read its `README.md` and
[`hosts/rylai.md`](https://github.com/leomontigatti/infra/blob/master/hosts/rylai.md)
before acting on a host. What En Escena work adds:

- **Write `root@rylai`, never a bare `rylai`.** Every command here and the
  scripts' defaults name the user, so they work from any admin device on the
  tailnet with no `~/.ssh/config` entry.
- **A tailnet policy change can break deploys.** Coolify reaches `rylai` over
  the tailnet as root; the infra repo's policy tests guard that rule.
- **Both hosts run with `--accept-dns=false`.** Tailscale leaves their resolver
  alone, so containers resolve as before.

### Proxy

On `rylai`, `coolify-proxy` is Traefik, pinned in
`/data/coolify/proxy/docker-compose.yml`
to the **floating** `traefik:v3.7` tag. A patch update is a pull and a recreate
with no file edit; the flip side is that the compose file does not record which
patch is running, so read it from the container rather than the config:

```bash
ssh root@rylai 'docker exec coolify-proxy traefik version'
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
  `node node_modules/@react-router/serve/bin.cjs ./build/server/index.js` on port
  `3000`.
- Runs migrations from the entrypoint before serving (above).
- Gates on the healthcheck at `/internal/health`: HTTP `200`, 60s start period,
  5s interval, 10 retries. That check is a liveness probe that never touches the
  database: migration success already gates startup, and a database check would
  mark a healthy container unhealthy during a blip and cause the restart loop the
  entrypoint's retry budget exists to prevent.

### Unexpected errors

An error a loader, action or render throws that is not a deliberate refusal (a
thrown `Response`, a redirect) writes one `[server:unexpected]` line to the
container's stderr, from `handleError` in `app/entry.server.tsx`: the tag, then
one JSON object with the route pattern, method, signed-in user id (or `null`),
time, release and stack, newlines escaped so a grep on the tag returns all of
it. Nothing from the request goes in: no param value, query string, form field,
header or session, and a failed query's bound values become `[redacted]`. The
pattern is React Router's own, recorded by the `instrumentations` export; an
error raised before any loader ran says `unknown` when its path holds a param.
The path is not used in its place, because a param can hold a value such as
`%252F`, which React Router decodes differently from any segment comparison. The
driver's own message is left out of a failed query as well, since it can quote the
offending value: the stack keeps only the SQL and the driver's code and constraint.
The release is `SOURCE_COMMIT`, which Coolify sets in the running container to
the deployed commit; it reads `unknown` where unset. The user id is looked up with
a one-second timeout and dropped when the lookup fails, since the database may be
what failed and the line must not wait for it. Read the lines in Coolify's
application **Logs** tab, or with
`ssh root@rylai 'docker logs x1383fsxfsixpgmvd9quv7tj-<deployment> 2>&1 | grep "server:unexpected"'`.
Retention there is short: `rylai`'s `/etc/docker/daemon.json` caps each
container's `json-file` log at three 10 MB files, and every deploy replaces the
container, so its lines go with it. A browser error writes the same line tagged
`[client:unexpected]`, without user id, method or release, to that browser's
console, and posts it to `/internal/client-error`, once per error object: a
failed navigation hands one error to every boundary it reached. The endpoint takes only a
same-origin JSON body under 8 KB, at most 60 per address (`CF-Connecting-IP`,
an IPv6 one counted by its /64) every 10 minutes, and stamps the server's
release and the session's user. Anyone can forge such a report, so browser
reports send at most 20 alerts an hour between them; past that they are kept
without alerting, and server errors still alert. The browser lists the error's
causes on the lines after its headline (`Caused by: TypeError: Load failed`),
since React Router wraps a data response cut off mid-body in "Unable to decode
turbo-stream response". A report whose headline or a cause is a browser's lost
connection (`Failed to fetch`, `Load failed`,
`NetworkError when attempting to fetch resource.`, `network error`,
`Error in body stream`) is kept without its own alert: the user's network failed, not our code. When five addresses report one
within an hour and those reports reach one in a hundred of the requests the
server answered in the hour, one `[client:lost-connection]` alert goes out
instead, since a proxy, TLS or CSP failure in front of the app never reaches
the server; a full theatre's phones losing a few requests on a busy night do
not. The count of requests served lives in the container, so in the first
minutes after a deploy, which drops connections itself, the five addresses
alone can send it. The release is never in the HTML: the repository is public, so the deployed commit
would tell anyone which fixes are not live yet.

The request count behind the lost-connection check is kept per minute over the last
hour, in the container. It counts every request React Router answers, documents, data
and resource routes alike, but not the static assets Express serves first, and a
request counts only once it is answered, so a stalled server does not look busy.

So each server line and each browser report is also kept as a row of
`en_escena_unexpected_error`, grouped by a **signature** that stays the same for one bug across releases.
Read the rows with `docker exec` and `psql` as in [Database](#database), for
example
`select signature, count(*), max(created_at) from en_escena_unexpected_error group by 1 order by 3 desc`.
Writing the row never fails or holds up the request; when it cannot be written,
`[unexpected-error:not-recorded]` is logged instead.

A signature's first row in an hour sends one message to the ops Telegram chat,
the one Coolify notifies, naming the route pattern and the error's first line
with no user id, param or body; a repeat within the hour sends nothing and is
counted in the next message. The bot comes from three variables on the
production application in Coolify, copied from the team's Telegram notification
settings:

| Variable             | Purpose                                                |
| -------------------- | ------------------------------------------------------ |
| `TELEGRAM_BOT_TOKEN` | The ops bot's token.                                   |
| `TELEGRAM_CHAT_ID`   | The chat Coolify notifies.                             |
| `TELEGRAM_TOPIC_ID`  | Optional: the topic in that chat, when it uses topics. |

With the token or the chat unset (locally, in tests, in staging) nothing is
sent, and `[ops-alert:disabled]` is logged once per process. A refused or
unreachable post logs `[ops-alert:failed]` with the status, never the token.
The send gives up after five seconds, since the alert goes out from the error path. A
network failure logs only the first line of its error, which names the host and never
the URL's path. A topic id that is not an integer is ignored, because the API would
refuse every message.

The recovery email send never throws. Better Auth would swallow a failed send and log
the raw error itself, so the app logs the failure once, through its own path (see
[Local auth](../local-auth.md)).

#### Unexpected error maintenance task

A Coolify scheduled task on the production **application** resource, set up
like the backup tasks ([Backups](./backups.md#daily-schedule): invoked with
`sh`, never `pnpm`), keeps the table to its 90 days and watches the connection
limit:

- Command: `sh scripts/unexpected-error-maintenance.sh`
- Frequency: `*/10 * * * *`, so a connection pile-up is seen within ten
  minutes; the deletion is an indexed range and costs nothing at that cadence.
- Environment: the application's own: `DATABASE_URL` and the Telegram
  variables above. `CONNECTION_ALERT_PERCENT` (default `80`) sets the
  threshold.

Each run deletes the rows older than 90 days, then compares the client
connections in `pg_stat_activity` with the slots the app's role can use
(`max_connections` less the reserved ones) and, at or above the threshold, posts `[postgres:connections] <used> of <max> …` to the ops chat. It
posts again on every run while the count stays high. With the Telegram variables
unset it prints the message instead; a failed post or query exits non-zero,
which Coolify reports as `TaskFailed` after its retries.

## Database

- Coolify-managed Postgres, image `postgres:17-alpine`, co-located with the app
  on the same VPS — app↔database latency is loopback.
- Database name: `enescena`. Every schema lives in it, including `public` and
  `drizzle`.
- `is_public: false`, with **no published port**: there is no route from a
  laptop. Reach it with `ssh root@rylai` and `docker exec`, not a tunnel. Read it as
  the `readonly` role, which can neither write nor be reached over the network:

  ```sh
  ssh root@rylai 'docker exec -i c24udczenueosjssymgxuhgf psql -U readonly -d enescena'
  ```

  The superuser is `postgres`; a write to production is a decision, not a
  shortcut.

- No connection pooling: Coolify ships no native pgBouncer, and one gets mounted
  separately only if peak load demands it.
- Backups are configured on the Postgres resource itself, not in this repo. See
  [Backups](./backups.md).

## Storage

- The live byte store is a persistent Coolify volume on the VPS, at
  `STORAGE_VOLUME_DIR` (`/var/lib/en-escena/storage` in production).
- Bucket directories under it keep the original object keys
  (`academies/...`), so the layout is identical to what B2 held.
- Backblaze B2 is a **backup destination only**. It is not the live store.
- `createSignedUrl` is not an S3 presign: it is a short-lived authenticated
  route that serves the byte from the volume. Nothing is lost to caching,
  because the edge must not cache PII in the first place.
- Dancer documents and individuals' document photos on this volume are
  plaintext PII; encryption at rest is
  accepted debt, documented in [Backups](./backups.md#encryption-at-rest-accepted-debt).
- A dancer's document image is deleted by the key stored on its row once the
  row stops pointing at it: the academy replaced or removed the photo in the
  portal, or a merge (`mergeRosterPeople`) discarded the removed dancer's
  document. The stored key, not the dancer's folder, is what finds the file,
  because a merge can leave a photo in another dancer's or another academy's
  folder. The delete runs after the write, so a failure cannot undo the save:
  it is logged as `[storage:dancer-document:orphan]` with the keys, and
  reconciliation is by hand from that line, as for choreography music below.
- The portal never writes a document image key the browser sends. The form's
  key fields only say whether a photo was kept or removed; a kept photo keeps
  the key already on the row.
- There is **one** storage backend in the app. The Supabase and Backblaze
  in-app adapters were deleted: they had no production caller and only
  made the storage layer read as though a live provider choice existed. The
  adapter seam ADR-0008 asked for is kept, with the filesystem store as its one
  implementation, so a future provider is a new implementation rather than a
  rewrite. The `@aws-sdk/*` packages went with those adapters: B2 is reached
  only by the backup shell scripts, through the `aws s3` CLI, so the application
  bundle carries no S3 client at all.

- Each uploaded asset kind has one read path, shared by the portal and the
  administration, so the two cannot disagree about whether a file is present.
- A missing key and an unreachable object both read as "no file" on every surface
  that shows one, and no read throws into a loader, so one broken object cannot blank
  a whole detail view. An unreachable object is logged first, since nothing else
  tells an operator that the volume is failing.
- Removing an object that is already gone succeeds for every kind, so a retried save
  converges.
- Stored bytes are served from the app's own origin with `nosniff`. The content type
  comes from the client's declared upload type, and `nosniff` keeps a browser from
  running an object as active content inside the origin.
- A single `bytes=` range reads only the requested slice off disk, which is what lets
  a player seek. An open end runs to the last byte, a suffix range is the last N bytes,
  and an end past the object is cut to it. Several ranges, or one that does not parse,
  get the whole object.
- A download name is ASCII, with no quotes or control characters, so it needs no
  RFC 5987 encoding. The check runs when the URL is made, where a bad name is a
  programming error.
- A browser sees only a bare `403` for an object it may not read, so an unreadable
  volume is logged when the object is served.

### Asset-kind policy

Each uploaded asset kind is declared once, in `app/lib/storage/asset-kinds.ts`:
bucket directory, accepted content types with their extensions, size ceiling,
signed-URL lifetime, and the Spanish labels the user copy is built from. The
server validation, the browser `accept` attribute and the messages a user reads
are all **derived** from that declaration, so raising a ceiling is one edit and
cannot leave a surface stating the old number.

Policy violations leave the storage layer as typed rejections
(`unsupported-content-type`, `file-too-large`), not exceptions with matchable
English prose; a single formatter turns a rejection into Spanish. Infrastructure
faults — an unwritable volume, a full disk — stay exceptions, because they are
not something the academy can correct by choosing a different file.

The extension travels with the accepted upload: each key builder takes it as an
argument rather than looking it up again, so a key cannot be built for a content type
the policy has no extension for.

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
- Downloads and the in-page player go through a signed URL that expires after
  **7200** seconds. Longer than the other kinds: the player asks for the song in
  byte ranges as it plays and seeks, all with the URL signed when the page
  loaded, so the URL has to outlast a listening session.
- The storage route answers a single byte range with `206 Partial Content`
  (every kind, though only the players ask for one), which is what lets the
  player seek.
- Replacement uploads the new object **before** deleting the previous one, so a
  failed upload leaves the existing music intact.
- The row is updated **before** the previous object is deleted, so a failed
  delete leaves that object orphaned on the volume. The replacement still
  succeeds — the academy is not told a save failed when it did not — and the
  orphan is logged as `[storage:music:orphan]` with the key. There is no sweep
  that reclaims it: reconciliation is by hand, from that log line, and it has to
  cover the B2 backup copy as well — see [Backups](./backups.md). Dancer
  documents follow the same order: the upload deletes nothing, and the previous
  image goes by its stored key only after the row is written.

- A save that picks a new file replaces the stored key. A refused save answers with
  the key it was asked to keep, so a delete the academy asked for survives the answer;
  an unexpected failure answers with none, and the form keeps the stored key. The
  evaluation switch is written before the music upload, since it has nothing to undo
  while the upload can still fail after it.
- A music save takes only the stored key or an empty one, never another key from a
  stale page or a hand-built request, since storing one would hand the academy another
  academy's song to read and to delete. With a file the key is unused: the upload names
  its own.
- The day's music archive holds one file per presentation with music, named so the
  running order reads off the file list. With more than one schedule, each file sits in
  a folder named for its schedule's start time and name, written as `10.00` since a
  colon is no file name on Windows. The list of missing music uses CRLF line endings so
  it reads right in Notepad.
- A music file that is missing from the volume is listed as missing, rather than
  breaking the archive halfway through. The archive stores its files without
  compression: audio barely shrinks, and the bytes stream off the volume instead of the
  whole day sitting in memory.
- A music file's name starts with its running-order number, padded to the width of the
  event's highest number so the order runs across the event. Accents and spaces are
  kept, characters that Windows or a Unix path refuses are dropped, and a name part is
  cut at 80 characters, since some file systems cap a name at 255.

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

- Event PDFs are served inline, so a PDF opens in the browser. The download name only
  decides what a save-as writes.

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
  exactly one object. The removal propagates: the row is written only
  afterwards, so a failure leaves the seminar pointing at the picture it
  already had. Dancer documents no longer work this way (see
  [Storage](#storage)).
- A removal deletes the object first and nulls the key second, and
  `removeInstructorPicture` tolerates an object that is already gone, so a retry
  converges. Deleting the seminar removes the object the same way.
- Deleting the **event** orphans the object, exactly as it orphans event
  documents today. Cleaning storage orphans on event deletion is a separate
  issue that has to cover both.
- The picture changes only when the save carries the picture's marker. A body without
  it leaves the picture alone: an absent file input looks exactly like a request to
  remove the picture, and the costly mistake is the one that deletes.
- The browser learns only whether the stored picture is kept, never its storage key.
  Clearing the upload field removes the picture on save.
- A picture chosen in the form always wins over the stored one: picking a file after
  clearing the field is a replacement, not a removal followed by an upload.

### `Gran final` banner contract

Bucket, formats, size limit and expiry are declared in
`app/lib/storage/asset-kinds.ts` and enforced by
`app/lib/storage/grand-final-banners.server.ts`; the shape rule lives in
`app/lib/grand-final/banner-shape.ts`, and the row that points at the objects
is written by `app/lib/grand-final/banners.server.ts`, from the finalist's
banner form under the `Gran final` list.

- Bucket directory: `en-escena-grand-final-banners`, private.
- Accepted formats: JPG, PNG and WEBP, up to **10 MB**, and only a picture
  16:9 within 2% and at least **1280 px** wide, read from the file's own header
  (`image-size`, EXIF orientation honoured). Downloads go through a signed URL
  that expires after **2 hours**: the vote page loads the banners lazily, as
  the voter scrolls, all with the URLs signed when the page loaded.
- Two objects per finalist academy within the event, at
  `events/{eventId}/grand-final/{academyId}/{first|second}-{uuid}.{ext}`. Each
  upload is a new key, never written over the one in use.
- A save uploads every new picture first, then writes the row, then deletes the
  replaced or removed objects. A refused picture deletes what that save already
  uploaded and leaves the row alone; a failed delete after the write orphans an
  object nothing points at and logs `[storage:grand-final-banner:orphan]`.
- Deleting the event or the academy (a merge too) cascades the row and orphans
  the objects, as event documents are orphaned today.
- A banner field takes any photo: the editor frames it to the banner's 16:9 shape and
  size, so administration never meets the shape rule. The framed picture is a
  1920×1080 JPEG within a 500 KB budget, encoded at the best of three qualities (0.85,
  0.75, 0.65) that fits, or the lowest when none does, because every voter's phone
  downloads it. When the browser cannot make the picture, the editor says it could not
  prepare the photo.
- The photo always fills the 16:9 frame and a move stops at its edge, so a banner has
  no empty bands. The preview and the uploaded picture come from one draw, so what
  administration frames is what the vote page shows. A frame that spans fewer source
  pixels than the banner's 1920 px width would enlarge the photo on upload, so the editor
  warns about it.
- Each banner travels as a file input and a hidden storage key: a picked file replaces
  it, an emptied key with no file removes it, and the stored key sent back keeps it. A
  body that carries neither field keeps the banner, since reading a missing field as a
  removal is the costly mistake.
- Only a finalist holds banners, and they belong to the academy within the event, so a
  change of pick never touches them.
- A banner save changes the row under a lock, against the row as stored rather than the
  one the form last saw, so two saves of one academy cannot leave it pointing at an
  object the other deleted. A voting round keeps the banner keys it opened with, so those
  objects outlive later changes and no round loses a banner it shows.

### Individual document photo contract

Bucket, formats, size limit and expiry are declared in
`app/lib/storage/asset-kinds.ts` and enforced by
`app/lib/storage/individual-document-photos.server.ts`; the row that points at
the object is written by `app/lib/individuals/personal-data.server.ts`, from
the individual's `Perfil` form.

- Bucket directory: `en-escena-individual-documents`, private.
- Accepted formats: JPG, PNG and WEBP, up to **10 MB**. Downloads go through a
  signed URL that expires after **300** seconds.
- One object per individual, at
  `individuals/{individualId}/document-{uuid}.{ext}`. Each upload is a new key,
  never written over the one in use.
- A save uploads the new photo first, then writes the row, then deletes the
  replaced or removed object. A refused photo saves nothing; a failed delete
  after the write orphans an object nothing points at and logs
  `[storage:individual-document-photo:orphan]`.
- It is not dancer verification: the photo only feeds the individual's link
  state (ADR-0019).

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
- `serveFilesystemObject` answers a single byte range with `206 Partial
Content`, the same as every other kind, which is what lets the feedback
  player's scrubber seek.
- The bucket is backed up only because it is named in `STORAGE_BACKUP_BUCKETS`,
  which production sets and the backup scripts default — see
  [Backups](./backups.md#required-environment). A show's audio is all recorded in
  one evening, so the base twice-a-day cadence is raised for the event days.
  Adding the bucket to the production variable is a
  [pending manual step](./backups.md#pending-production-step-before-the-october-event).

- A submission carries one of three intents: `keep` (the default, also when the
  recorder was never used), `replace` or `remove`. A take removed before it was saved
  sends nothing, and an empty file part is never read as a deletion.
- The take preloads with the page, because its signed link expires after 300 seconds
  and the take must still play after that.
- Recording uses the browser's `MediaRecorder` with webm/opus, which only Chrome
  supports, and the recorder stops itself at five minutes.
- The take's storage is built only when a stored take exists, so a judge or panel with
  no takes needs no storage environment to be read or saved.
- A save refuses in a fixed order (a presentation that is not the judge's, then a closed
  day, then a value the sheet does not accept) and only then uploads a take, so no take
  is stored for a save that was never going to happen.
- A take uploaded inside a save that then rolls back stays on the volume with no row
  pointing at it. The save logs its key under `[storage:feedback-audio:orphan]`, so it
  can be found by hand.

## ARCA credentials

- The certificate and the private key are injected as base64, one line each, as a CI
  or environment secret, and decoded to PEM when the configuration is read. A malformed
  value has no PEM header once decoded, and it is rejected at that point with a clear
  message.
- ARCA runs against homologation unless production is enabled by an explicit flag, so an
  unconfigured environment cannot issue real comprobantes. Staging sets the flag off (see
  [Staging](./staging.md)).
- The WSAA access ticket is cached in the process, and the client is shared per process.
  The ticket lasts about 12 hours and ARCA refuses repeated logins, so logging in per
  request would be refused. The cache belongs to each client instance, so tests can
  isolate it, unlike the SDK's global static map.

## `Gran final` vote: secrets, URLs and sign-in

- An audit link's token is 128 bits of an HMAC of the link's id, under a key derived
  from `BETTER_AUTH_SECRET`. Only the SHA-256 of the token is stored, so a database read
  alone opens no link. A plain hash is enough because nobody can derive or guess a
  128-bit token, and the lookup stays one indexed equality.
- A live link's address and QR are derived again for each answer, and they come back
  only from a create or a show, in answers no browser or proxy keeps. The list never
  carries them, and the voter-code sheet and the voter sign-in answers are not cached
  either.
- The key for an audit link's token and the voter cookie's key both derive from
  `BETTER_AUTH_SECRET`, which production requires: without it production fails closed,
  while development and tests use a fixed value. An audit link whose token no longer
  matches its stored hash after a key change is never handed over.
- The public vote's absolute URLs, the QR codes, the sign-in redirect URI and the
  portal's vote link are built on `APP_URL`, falling back to the request's origin. Sign-in
  start and finish must send the same redirect URI. A QR code carries the vote page with
  the voter's code in its `codigo` parameter.
- The voter sign-in is Google when both Google credentials are set, a local stand-in
  outside production, and absent in a production build without them, where the vote page
  offers the QR code alone.

## Related runbooks

- [Backups](./backups.md) — database and storage backups, restore drills.
- [Database migrations](../db/migrations.md) — how schema changes reach
  production.
- [DNS and email](./dns-and-email.md) — zone, WAF and outbound mail.
