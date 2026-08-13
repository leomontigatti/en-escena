-- Drop of `porcion` and its enum. `Porción` labelled a comprobante as covering
-- the seña or the saldo, which only made sense under the two-rung ladder #676
-- retired: money is now allocated in arbitrary amounts against two thresholds,
-- so a comprobante covers neither rung and the column was asserting something
-- untrue. Irreversible on purpose: there is no `down`.
--
-- Deliberately NOT guarded, unlike migration 0009. The check that matters here
-- is `select count(*) from en_escena_comprobante;` returning zero, and it is a
-- pre-merge check on the PR rather than a `RAISE EXCEPTION` in this file: a
-- guard would turn a comprobante emitted between merge and deploy into a failed
-- container start, and what it would be protecting is metadata no code reads
-- after this migration and that ADR-0014 §5 deletes from the settled model
-- anyway. A blocked deploy is the worse of the two outcomes.
ALTER TABLE "en_escena_comprobante" DROP COLUMN "porcion";--> statement-breakpoint
DROP TYPE "public"."en_escena_comprobante_porcion";
