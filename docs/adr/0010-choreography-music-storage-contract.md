# Choreography music storage contract

Choreography music uses a private Supabase Storage bucket named `choreography-music`, stores only the current storage key on the Coreografia, and exposes downloads through short-lived signed URLs. V1 accepts MP3, M4A/AAC, WAV and OGG files up to 50 MB, matching Supabase's Free plan upload ceiling and avoiding video or uncommon audio formats. Replacements upload the new object before deleting the previous one, so failed uploads leave the existing music intact while successful replacements avoid orphaned objects.
