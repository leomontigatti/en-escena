-- The mandatory first-login password change retired in #1365 (ADR-0003
-- amendment): administrators set an internal user's password outright, so
-- nothing reads or writes this flag any more.
-- reason: contract step of #1365; no running code has selected the column
-- since that PR deployed, which is why this one merges only after it.
-- squawk-ignore ban-drop-column
ALTER TABLE "en_escena_user" DROP COLUMN "requires_password_change";
