-- reason: drops the internal-user invitation table ADR-0003 left behind, in one
-- step as #1495 asks rather than after a separate contract deploy. Only the old
-- container's `/invitacion/:token` route reads it, and nothing has issued a
-- token since direct creation replaced invitations, so the last one expired
-- long ago. The cost accepted: for the length of the deploy, a stale or invented
-- `/invitacion/...` link served by the old container fails with a server error
-- instead of the invalid-link page.
-- squawk-ignore ban-drop-table
DROP TABLE "en_escena_internal_user_invitation" CASCADE;
