# Architecture Decisions

Read ADRs selectively. Start with the topic that matches the change, then follow
explicit supersedes or conflict notes inside the ADR.

## By Topic

- Access and authentication: `0001-better-auth-for-access.md`, `0003-direct-internal-user-access.md`, `0005-use-supabase-postgres-before-supabase-auth.md`, `0006-use-supabase-auth-for-access.md`
- Event context: `0002-selectable-event-contexts.md`
- Code organization: `0004-organize-app-code-by-product-surface.md`
- Database test strategy: `0007-db-test-isolation-model.md`
- Uploaded assets: `0008-use-supabase-storage-for-uploaded-assets.md`
- Choreography music storage: `0010-choreography-music-storage-contract.md`
- Finances: `0009-manual-event-scoped-account-current.md`

## Decisions

- [ADR-0001: Better Auth for access](./0001-better-auth-for-access.md) - superseded by ADR-0006, retained for historical context.
- [ADR-0002: Selectable event contexts](./0002-selectable-event-contexts.md) - accepts `Evento activo` as the only V1 event context.
- [ADR-0003: Direct internal user access](./0003-direct-internal-user-access.md) - records internal username access before the Supabase Auth migration.
- [ADR-0004: Organize app code by product surface](./0004-organize-app-code-by-product-surface.md) - keeps UI and route code organized by surface before resource.
- [ADR-0005: Supabase Postgres before Supabase Auth](./0005-use-supabase-postgres-before-supabase-auth.md) - sequences infrastructure migration before auth provider migration.
- [ADR-0006: Supabase Auth for access credentials](./0006-use-supabase-auth-for-access.md) - current access credential and session provider decision.
- [ADR-0007: DB test isolation model](./0007-db-test-isolation-model.md) - keeps focused DB tests on PGlite snapshots and final DB confidence on Postgres.
- [ADR-0008: Supabase Storage for uploaded assets](./0008-use-supabase-storage-for-uploaded-assets.md) - current object storage boundary for uploaded assets.
- [ADR-0009: Manual event-scoped account currents](./0009-manual-event-scoped-account-current.md) - keeps V1 financial operations manual, event-scoped and account-current based.
- [ADR-0010: Choreography music storage contract](./0010-choreography-music-storage-contract.md) - current bucket, file type and replacement contract for choreography music.
