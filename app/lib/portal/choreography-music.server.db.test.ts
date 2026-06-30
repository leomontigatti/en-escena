import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import {
  updateChoreographyMusic,
  loadChoreographyMusicDownloadUrl,
} from "@/lib/portal/choreography-music.server";
import {
  createAcademySession,
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("portal choreography music", () => {
  test("uploads new music, stores the key, and removes the previous object", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Música",
      email: "music.update@example.com",
    });
    const event = await createEventRecord({ active: true });
    const catalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      musicStorageKey: "academies/old/choreographies/old/music.mp3",
      name: "Con música",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const calls: Array<unknown> = [];
    const storage = {
      createMusicSignedUrl: async (storageKey: string) =>
        `signed:${storageKey}`,
      removeMusic: async (storageKey: string) => {
        calls.push({ storageKey, type: "remove" });
      },
      uploadMusic: async (input: {
        academyId: string;
        choreographyId: string;
        file: Blob;
      }) => {
        calls.push({ ...input, type: "upload" });

        return `academies/${input.academyId}/choreographies/${input.choreographyId}/music.ogg`;
      },
    };
    const file = new File(["music"], "musica.ogg", { type: "audio/ogg" });

    await expect(
      updateChoreographyMusic({
        academyId: owner.academyId,
        choreographyId: choreography.id,
        eventId: event.id,
        file,
        submittedStorageKey: choreography.musicStorageKey ?? "",
        storage,
      }),
    ).resolves.toEqual({ ok: true });

    await expect(
      db.query.choreographies.findFirst({
        columns: { musicStorageKey: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({
      musicStorageKey: `academies/${owner.academyId}/choreographies/${choreography.id}/music.ogg`,
    });
    expect(calls).toEqual([
      {
        academyId: owner.academyId,
        choreographyId: choreography.id,
        file,
        type: "upload",
      },
      {
        storageKey: "academies/old/choreographies/old/music.mp3",
        type: "remove",
      },
    ]);
    await expect(
      loadChoreographyMusicDownloadUrl(
        `academies/${owner.academyId}/choreographies/${choreography.id}/music.ogg`,
        storage,
      ),
    ).resolves.toBe(
      `signed:academies/${owner.academyId}/choreographies/${choreography.id}/music.ogg`,
    );
  });

  test("removes music and marks the choreography as pending music again", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Borra Música",
      email: "music.clear@example.com",
    });
    const event = await createEventRecord({ active: true });
    const catalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      musicStorageKey: "academies/music/current.mp3",
      name: "Sin música",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const removedKeys: string[] = [];
    const storage = {
      createMusicSignedUrl: async (storageKey: string) =>
        `signed:${storageKey}`,
      removeMusic: async (storageKey: string) => {
        removedKeys.push(storageKey);
      },
      uploadMusic: async () => {
        throw new Error("Unexpected upload");
      },
    };

    await expect(
      updateChoreographyMusic({
        academyId: owner.academyId,
        choreographyId: choreography.id,
        eventId: event.id,
        file: null,
        submittedStorageKey: "",
        storage,
      }),
    ).resolves.toEqual({ ok: true });

    await expect(
      db.query.choreographies.findFirst({
        columns: { musicStorageKey: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({ musicStorageKey: null });
    expect(removedKeys).toEqual(["academies/music/current.mp3"]);
  });

  test("blocks music changes once the choreography has a presentation", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Presentada",
      email: "music.presentation@example.com",
    });
    const event = await createEventRecord({ active: true });
    const catalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      hasPresentation: true,
      modalityId: catalog.modality.id,
      musicStorageKey: "academies/music/current.mp3",
      name: "Presentada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const storage = {
      createMusicSignedUrl: async (storageKey: string) =>
        `signed:${storageKey}`,
      removeMusic: async () => {
        throw new Error("Unexpected remove");
      },
      uploadMusic: async () => {
        throw new Error("Unexpected upload");
      },
    };

    await expect(
      updateChoreographyMusic({
        academyId: owner.academyId,
        choreographyId: choreography.id,
        eventId: event.id,
        file: null,
        submittedStorageKey: "",
        storage,
      }),
    ).resolves.toEqual({
      ok: false,
      message:
        "No podés editar la música porque la coreografía ya tiene una presentación asociada.",
    });
    await expect(
      db.query.choreographies.findFirst({
        columns: { musicStorageKey: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({ musicStorageKey: "academies/music/current.mp3" });
  });
});
