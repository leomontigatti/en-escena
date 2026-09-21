import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import {
  assertPortalChoreographyFound,
  portalOwnedChoreographyWhere,
} from "@/lib/choreographies/choreography-access.server";
import { hasEvaluatedPresentation } from "@/lib/presentations/evaluation-lock.server";
import { formatUploadRejection } from "@/lib/storage/asset-kinds";
import type { ChoreographyMusicStorage } from "@/lib/storage/choreography-music.server";

export type UpdateChoreographyMusicResult =
  { ok: true } | { ok: false; message: string };

/**
 * The two states that close the music for the academy. A withdrawn
 * choreography is not taking part, so only an administrator restoring it opens
 * it again; an evaluated one is history. The withdrawal is asked first because
 * it is free, and the two cannot coexist anyway.
 */
async function findMusicEditingLock(input: {
  choreographyId: string;
  withdrawnAt: Date | null;
}): Promise<string | null> {
  if (input.withdrawnAt) {
    return "No podés editar la música porque la coreografía está retirada.";
  }

  if (await hasEvaluatedPresentation(input.choreographyId)) {
    return "No podés editar la música porque la coreografía ya fue evaluada.";
  }

  return null;
}

export async function updateChoreographyMusic(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  file: File | null;
  storage: ChoreographyMusicStorage;
  submittedStorageKey: string;
}): Promise<UpdateChoreographyMusicResult> {
  const choreography = assertPortalChoreographyFound(
    await db.query.choreographies.findFirst({
      columns: {
        musicStorageKey: true,
        withdrawnAt: true,
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

  const lockMessage = await findMusicEditingLock({
    choreographyId: input.choreographyId,
    withdrawnAt: choreography.withdrawnAt,
  });

  if (lockMessage) {
    return { ok: false, message: lockMessage };
  }

  let nextStorageKey = input.submittedStorageKey;

  if (input.file) {
    const uploaded = await input.storage.uploadMusic({
      academyId: input.academyId,
      choreographyId: input.choreographyId,
      file: input.file,
    });

    // A policy rejection is the academy's to fix, so it becomes the same
    // `ok: false` the presentation lock already returns. Nothing is written:
    // the record still points at the file they had.
    if (!uploaded.ok) {
      return { ok: false, message: formatUploadRejection(uploaded.rejection) };
    }

    nextStorageKey = uploaded.storageKey;
  }

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
      await input.storage.removeMusic(currentStorageKey);
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
