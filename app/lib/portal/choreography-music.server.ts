import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import {
  assertPortalChoreographyFound,
  portalOwnedChoreographyWhere,
} from "@/lib/choreographies/choreography-access.server";
import { createDefaultChoreographyMusicStorage } from "@/lib/storage/choreography-music.server";

type PortalChoreographyMusicStorage = ReturnType<
  typeof createDefaultChoreographyMusicStorage
>;

export type UpdateChoreographyMusicResult =
  | { ok: true }
  | { ok: false; message: string };

export async function loadPortalChoreographyMusicDownloadUrl(
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
  const choreography = assertPortalChoreographyFound(
    await db.query.choreographies.findFirst({
      columns: {
        hasPresentation: true,
        musicStorageKey: true,
      },
      where: portalOwnedChoreographyWhere(input),
    }),
  );

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
    } catch (thrown) {
      // The row already points at the new object, so failing here cannot undo
      // the replacement: propagating, as `dancer-documents.server.ts` does,
      // would tell the academy the music was not saved when it was. The cost is
      // that the previous object stays orphaned on the volume — no sweep
      // reclaims it — and this line is the only thing that makes it locatable
      // without walking the volume by hand.
      console.error("[storage:music:orphan]", {
        choreographyId: input.choreographyId,
        detail: thrown instanceof Error ? thrown.message : String(thrown),
        storageKey: currentStorageKey,
      });
    }
  }

  return { ok: true };
}
