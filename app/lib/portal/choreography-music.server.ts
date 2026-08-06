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
      // La fila ya apunta al objeto nuevo, así que fallar acá no puede cancelar
      // el reemplazo: propagar como en `dancer-documents.server.ts` le diría a
      // la academia que no se guardó la música cuando sí se guardó. El costo es
      // que el objeto viejo queda huérfano en el volumen —no hay barrido que lo
      // recoja— y esta línea es lo único que lo hace ubicable sin revisar el
      // volumen a mano.
      console.error("[storage:music:orphan]", {
        choreographyId: input.choreographyId,
        detail: thrown instanceof Error ? thrown.message : String(thrown),
        storageKey: currentStorageKey,
      });
    }
  }

  return { ok: true };
}
