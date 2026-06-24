# Use Supabase Storage for uploaded assets

**Status**: proposed

**Date**: 2026-06-24

## Context

En Escena already stores file references as storage keys in the application
database. Current examples are:

- `dancer.document_front_image_storage_key`
- `dancer.document_back_image_storage_key`
- `choreography.music_storage_key`

The immediate need is to show and manage dancer document images in the Portal
de academias, matching the fields already visible in the Panel de
administracion. Before wiring those UI flows, we need a clear filestore
boundary.

## Verified Supabase facts

As of 2026-06-24, Supabase's current public pricing and storage docs say:

- Free plan includes 1 GB of file storage.
- Free plan includes 5 GB egress plus 5 GB cached egress, described in the
  Storage bandwidth docs as a 10 GB bandwidth limit across database, storage,
  and functions.
- Free plan max file upload size is 50 MB.
- Pro includes 100 GB file storage, then usage over quota is billed at
  $0.0213 per GB per month.
- Supabase Storage is S3-compatible, but it is not full AWS S3. It supports
  common S3 object operations and AWS Signature Version 4, but does not support
  S3 bucket versioning; deleted objects are permanently removed.

Sources:

- https://supabase.com/pricing
- https://supabase.com/docs/guides/storage/pricing
- https://supabase.com/docs/guides/storage/serving/bandwidth
- https://supabase.com/docs/guides/storage/s3/compatibility
- https://supabase.com/changelog.md

## Decision

Use hosted Supabase Storage as the first filestore for uploaded En Escena
assets.

The application database remains the source of truth for domain records and
stores only storage keys, not public URLs. The app should generate upload and
read access through a server-owned storage boundary, so future migration to
another S3-compatible provider remains possible.

Use private buckets by default for document images and other academy-owned
assets. The Portal de academias should only access assets belonging to the
authenticated Academia, and the Panel de administracion should access assets
through administrative authorization.

Treat Supabase Storage's Free plan as enough for a low-volume pilot, not as a
production capacity commitment. A single Evento with many dancers and music
uploads can exceed 1 GB quickly, and repeated downloads can hit egress limits
even before stored size is exhausted.

For dancer document images, use this initial bucket contract:

- Bucket: `dancer-documents`
- Access model: private bucket
- Max file size: 10 MB
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
- Front image key:
  `academies/{academyId}/dancers/{dancerId}/document-front.{ext}`
- Back image key:
  `academies/{academyId}/dancers/{dancerId}/document-back.{ext}`

Do not configure choreography music storage as part of this decision.
`choreography.music_storage_key` needs a separate capacity and upload-limit
decision because music files have different size and serving characteristics.

## Considered options

### Supabase Storage hosted

Pros:

- Managed object storage, CDN, auth integration, dashboard, and usage metrics.
- Same vendor as the current Supabase Postgres/Auth direction.
- S3-compatible enough to keep the app's storage boundary portable.
- Simple production path: no server disk lifecycle, no custom static-file
  serving, no extra backup job for uploaded objects.

Cons:

- Free plan storage is small: 1 GB.
- Free plan max upload size is 50 MB, which is fine for compressed document
  images but may constrain choreography music files.
- Hosted pricing and quotas can change, so capacity assumptions need periodic
  review.
- No S3 versioning, so delete/replace behavior must be app-owned if retention
  matters.

### VPS filesystem on the app server

Pros:

- No extra hosted storage bill while disk capacity is available.
- Low latency from the app process to local files.
- Straightforward for a single-container, single-server deployment.

Cons:

- Uploads become tied to one server's disk and deployment shape.
- Requires explicit backup, restore, migration, retention, monitoring, and
  cleanup policies.
- Complicates horizontal scaling and failover.
- Serving private files safely requires app-controlled streaming or signed URL
  infrastructure we would own.
- A disk-full condition can affect the app runtime itself.

### Coolify Persistent Storage on a separate VPS

Pros:

- Coolify can preserve data across redeployments with Docker volumes or bind
  mounts.
- Useful for state that must survive container replacement.
- Volume or directory mounts can support an uploads directory for a simple
  self-hosted deployment.

Cons:

- It is still VPS-local storage, not object storage.
- Backups, replication, restore tests, disk monitoring, and security remain our
  responsibility.
- A separate Coolify VPS adds network and operational coupling between app and
  files.
- File mounts are better suited to config files, not user uploads.
- Sharing the same mounted directory across multiple containers is risky unless
  locking and consistency are deliberately handled.

## Coolify storage note

For Coolify, a `volume mount` or `directory mount` is the relevant shape for
uploaded files. A `file mount` is for mounting a single file, usually
configuration content. It should not be used as the filestore for document
images or music uploads.

## Consequences

- Future portal/admin work should depend on an app-level storage service, not
  direct Supabase calls spread through route code.
- Retention/delete behavior still needs to be specified before implementation.
- Document images should be compressed/resized before or during upload so the
  Free plan remains viable for pilots.
- Choreography music needs a separate capacity check because file sizes can
  exceed image assumptions and may hit the Free plan's 50 MB upload limit.

## Revisit when

- Stored assets approach 70% of the active plan quota.
- Egress approaches 70% of the active plan quota.
- Music uploads regularly exceed 50 MB.
- The app needs horizontal scaling, multi-region serving, or strict object
  retention/versioning.
- Monthly storage cost or vendor constraints make a dedicated S3-compatible
  provider preferable.
