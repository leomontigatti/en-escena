# Choreography music storage contract

**Status**: superseded by ADR-0013

The live contract — accepted formats, the 50 MB limit, the signed-URL expiry and
the upload-before-delete replacement ordering — moved to
[docs/operations/infrastructure.md](../operations/infrastructure.md) as current
state. Read it there. What follows is the original record, kept because
`docs/adr/` is append-only; it names a Supabase bucket that no longer exists and
justifies its size limit by a Supabase plan ceiling that no longer applies.

Choreography music uses a private Supabase Storage bucket named `choreography-music`, stores only the current storage key on the Coreografia, and exposes downloads through short-lived signed URLs. V1 accepts MP3, M4A/AAC, WAV and OGG files up to 50 MB, matching Supabase's Free plan upload ceiling and avoiding video or uncommon audio formats. Replacements upload the new object before deleting the previous one, so failed uploads leave the existing music intact while successful replacements avoid orphaned objects.
