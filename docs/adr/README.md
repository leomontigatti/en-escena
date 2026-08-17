# Architecture Decisions

Read ADRs selectively. Start with the topic that matches the change, then follow
explicit supersedes or conflict notes inside the ADR.

`docs/adr/*.md` is live decisions only. Superseded ADRs move to
`docs/adr/superseded/` — kept for rationale, not for what runs today.

## By Topic

- Access and authentication: `0013-exit-supabase.md`, `superseded/0001-better-auth-for-access.md`, `0003-direct-internal-user-access.md`, `superseded/0005-use-supabase-postgres-before-supabase-auth.md`, `superseded/0006-use-supabase-auth-for-access.md`
- Event context: `0002-selectable-event-contexts.md`
- Code organization: `0004-organize-app-code-by-product-surface.md`
- Database test strategy: `0007-db-test-isolation-model.md`
- Uploaded assets: `0013-exit-supabase.md`, `superseded/0008-use-supabase-storage-for-uploaded-assets.md`
- Choreography music storage: `superseded/0010-choreography-music-storage-contract.md` (live contract in `docs/operations/infrastructure.md`)
- Infrastructure and hosting: `0013-exit-supabase.md`
- Finances: `0014-arbitrary-amount-allocation-and-comprobante-amendments.md`, `0009-inscription-based-finances.md`, `superseded/0011-invoicing-concept-portion-and-surfaces.md`, `superseded/0012-arca-unreachable-contingency-and-recovery.md`

## Decisions

- [ADR-0002: Selectable event contexts](./0002-selectable-event-contexts.md) - accepts `Evento activo` as the only V1 event context.
- [ADR-0003: Direct internal user access](./0003-direct-internal-user-access.md) - records internal username access before the Supabase Auth migration.
- [ADR-0004: Organize app code by product surface](./0004-organize-app-code-by-product-surface.md) - keeps UI and route code organized by surface before resource.
- [ADR-0007: DB test isolation model](./0007-db-test-isolation-model.md) - keeps focused DB tests on PGlite snapshots and final DB confidence on Postgres.
- [ADR-0009: Inscription-based finances](./0009-inscription-based-finances.md) - models finances around inscriptions and payment assignments as the single operational source of truth (ratified, not superseded, by ADR-0014).
- [ADR-0013: Exit Supabase](./0013-exit-supabase.md) - records the rationale for leaving Supabase across auth, storage and database, and points at `docs/operations/infrastructure.md` for what runs today (supersedes ADR-0001, ADR-0005, ADR-0006, ADR-0008, ADR-0010).
- [ADR-0014: Arbitrary-amount allocation, the live discount, and the comprobante amendment star](./0014-arbitrary-amount-allocation-and-comprobante-amendments.md) - records the rationale of finance map #547 and points at `docs/domain/finances.md` for the model itself (supersedes ADR-0011, ADR-0012; ratifies ADR-0009).

## Superseded

- [ADR-0001: Better Auth for access](./superseded/0001-better-auth-for-access.md) - superseded by ADR-0013; Better Auth is live again, but in the shape ADR-0013 describes.
- [ADR-0005: Supabase Postgres before Supabase Auth](./superseded/0005-use-supabase-postgres-before-supabase-auth.md) - superseded by ADR-0013; sequenced the Supabase adoption that has since been reversed.
- [ADR-0006: Supabase Auth for access credentials](./superseded/0006-use-supabase-auth-for-access.md) - superseded by ADR-0013; Supabase Auth is no longer the provider.
- [ADR-0008: Supabase Storage for uploaded assets](./superseded/0008-use-supabase-storage-for-uploaded-assets.md) - superseded by ADR-0013; uploaded assets live on a local volume now.
- [ADR-0010: Choreography music storage contract](./superseded/0010-choreography-music-storage-contract.md) - superseded by ADR-0013; the live contract moved to `docs/operations/infrastructure.md`.
- [ADR-0011: Invoicing concept, derived portion, and comprobante surfaces](./superseded/0011-invoicing-concept-portion-and-surfaces.md) - superseded by ADR-0014; `porción` is deleted and the portion, print and vigencia contracts it rests on were all replaced.
- [ADR-0012: ARCA unreachable contingency and recovery](./superseded/0012-arca-unreachable-contingency-and-recovery.md) - superseded by ADR-0014; its recovery matcher was repaired by correlative reservation and its no-persistence rule reversed. Decisions 1, 2, 3 and 6 are restated in ADR-0014.
