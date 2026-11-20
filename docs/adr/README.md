# Architecture Decisions

Read ADRs selectively. Start with the topic that matches the change, then follow
explicit conflict notes inside the ADR.

`docs/adr/*.md` is decisions in force only. A superseded ADR is deleted in the
change that supersedes it; git keeps the record. Each ADR ends on a `Governs:`
line naming the code it shapes, and the `domain-modeling` skill's `anchors.py`
lists an anchor that has left the code.

## By Topic

- Access and authentication: `0013-exit-supabase.md`, `0003-direct-internal-user-access.md`
- Event context: `0002-selectable-event-contexts.md`
- Code organization: `0004-organize-app-code-by-product-surface.md`
- Database test strategy: `0007-db-test-isolation-model.md`
- Uploaded assets: `0013-exit-supabase.md`
- Choreography music storage: `docs/operations/infrastructure.md` holds the contract
- Infrastructure and hosting: `0013-exit-supabase.md`
- Tooling and guardrails: `0015-deterministic-guardrails.md`
- Agent workflow: `0016-local-implementation.md`
- `Gran final` and public vote: `0018-voter-identity-outside-access.md`
- Individual users (`Particular`): `0019-individual-owns-its-own-pool.md`
- Finances: `0017-waived-inscription.md`, `0014-arbitrary-amount-allocation-and-comprobante-amendments.md`, `0009-inscription-based-finances.md`

## Decisions

- [ADR-0002: Selectable event contexts](./0002-selectable-event-contexts.md) - accepts `Evento activo` as the only V1 event context.
- [ADR-0003: Direct internal user access](./0003-direct-internal-user-access.md) - records internal username access before the Supabase Auth migration.
- [ADR-0004: Organize app code by product surface](./0004-organize-app-code-by-product-surface.md) - keeps UI and route code organized by surface before resource.
- [ADR-0007: DB test isolation model](./0007-db-test-isolation-model.md) - keeps focused DB tests on PGlite snapshots and final DB confidence on Postgres.
- [ADR-0009: Inscription-based finances](./0009-inscription-based-finances.md) - models finances around inscriptions and payment assignments as the single operational source of truth (ratified, not superseded, by ADR-0014).
- [ADR-0013: Exit Supabase](./0013-exit-supabase.md) - records the rationale for leaving Supabase across auth, storage and database, and points at `docs/operations/infrastructure.md` for what runs today (supersedes ADR-0001, ADR-0005, ADR-0006, ADR-0008, ADR-0010).
- [ADR-0014: Arbitrary-amount allocation, the live discount, and the comprobante amendment star](./0014-arbitrary-amount-allocation-and-comprobante-amendments.md) - records the rationale of finance map #547 and points at `docs/domain/finances.md` for the model itself (supersedes ADR-0011, ADR-0012; ratifies ADR-0009).
- [ADR-0015: Deterministic guardrails before judgement](./0015-deterministic-guardrails.md) - records why the gates of map #929 exist, what a lint rule has to justify to enter, and what was rejected; points at `docs/operations/ci.md` and `docs/agents/validation.md` for the setup itself.
- [ADR-0016: Implementation and review happen in local sessions](./0016-local-implementation.md) - retires the AFK Implement, Implement PRD, Implement PR and Review runners in favour of T3 Code sessions with a browser, and keeps Architecture Review; its 2026-09-25 amendment retires To Issues for the `to-tickets` skill, its 2026-09-26 amendment retires Update Branch, Label Behind PRs and Promote Queued for the `babysit-pr` skill, and its 2026-10-13 amendment moves Architecture Review to a T3 Code scheduled task.
- [ADR-0017: A free inscription is a waiver, not a zero price or a discount](./0017-waived-inscription.md) - records why a free choreography place is a `Bonificada` waiver on the inscription rather than a zero price row or a 100% `administrativeDiscount`.
- [ADR-0018: A voter is not a user, and the `Gran final` is not an award](./0018-voter-identity-outside-access.md) - keeps the public voter's identity outside the access domain (own table, own cookie, own OAuth exchange) and the `grandFinal` ranking beside `award` rather than inside it.
- [ADR-0019: An individual owns its inscriptions and money the way an academy does](./0019-individual-owns-its-own-pool.md) - makes the `individual` (`Particular`) a participating entity of its own kind with a one-person roster on the academy's existing money owner, instead of a polymorphic owner across finances.
