import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import { choreographyNotFoundMessage } from "@/lib/portal/choreography-roster.shared";
import { createDefaultChoreographyMusicStorage } from "@/lib/storage/choreography-music.server";

type PortalChoreographyMusicStorage = ReturnType<
  typeof createDefaultChoreographyMusicStorage
>;

export type UpdateChoreographyMusicResult =
  | { ok: true }
  | { ok: false; message: string };

export async function loadChoreographyMusicDownloadUrl(
  storageKey: string | null,
  storage?: PortalChoreographyMusicStorage,
) {
  if (!storageKey) {
    return null;
  }

  try {
    const storageClient = storage ?? createDefaultChoreographyMusicStorage();

    return await storageClient.createMusicSignedUrl(storageKey);
  } catch {
    return null;
  }
}

export async function updateChoreographyMusic(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  file: File | null;
  submittedStorageKey: string;
  storage?: PortalChoreographyMusicStorage;
}): Promise<UpdateChoreographyMusicResult> {
  const choreography = await db.query.choreographies.findFirst({
    columns: {
      hasPresentation: true,
      musicStorageKey: true,
    },
    where: and(
      eq(choreographies.id, input.choreographyId),
      eq(choreographies.academyId, input.academyId),
      eq(choreographies.eventId, input.eventId),
    ),
  });

  if (!choreography) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const currentStorageKey = choreography.musicStorageKey ?? "";
  const hasSubmittedChange =
    input.file !== null || input.submittedStorageKey !== currentStorageKey;

  if (!hasSubmittedChange) {
    return { ok: true };
  }

  if (choreography.hasPresentation) {
    return {
      ok: false,
      message:
        "No podés editar la música porque la coreografía ya tiene una presentación asociada.",
    };
  }

  const storageClient =
    input.storage ?? createDefaultChoreographyMusicStorage();
  const nextStorageKey = input.file
    ? await storageClient.uploadMusic({
        academyId: input.academyId,
        choreographyId: input.choreographyId,
        file: input.file,
      })
    : input.submittedStorageKey;

  await db
    .update(choreographies)
    .set({
      musicStorageKey: nextStorageKey || null,
      updatedAt: new Date(),
    })
    .where(eq(choreographies.id, input.choreographyId));

  const shouldRemovePrevious =
    currentStorageKey.length > 0 && currentStorageKey !== nextStorageKey;

  if (shouldRemovePrevious) {
    try {
      await storageClient.removeMusic(currentStorageKey);
    } catch {
      // The database now points at the intended file. Cleanup can be retried by maintenance.
    }
  }

  return { ok: true };
}
