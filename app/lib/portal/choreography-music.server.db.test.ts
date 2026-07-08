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
    const { choreography, event, owner } = await createMusicChoreographyFixture(
      {
        academyName: "Academia Música",
        email: "music.update@example.com",
        musicStorageKey: "academies/old/choreographies/old/music.mp3",
        name: "Con música",
      },
    );
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
    const { choreography, event, owner } = await createMusicChoreographyFixture(
      {
        academyName: "Academia Borra Música",
        email: "music.clear@example.com",
        musicStorageKey: "academies/music/current.mp3",
        name: "Sin música",
      },
    );
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
    const { choreography, event, owner } = await createMusicChoreographyFixture(
      {
        academyName: "Academia Presentada",
        email: "music.presentation@example.com",
        hasPresentation: true,
        musicStorageKey: "academies/music/current.mp3",
        name: "Presentada",
      },
    );
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

async function createMusicChoreographyFixture(input: {
  academyName: string;
  email: string;
  hasPresentation?: boolean;
  musicStorageKey: string;
  name: string;
}) {
  const owner = await createAcademySession({
    academyName: input.academyName,
    email: input.email,
  });
  const event = await createEventRecord({ active: true });
  const catalog = await createEventCatalog(event.id);
  const choreography = await createChoreographyRecord({
    academyId: owner.academyId,
    categoryId: catalog.categoryWithLevel.id,
    eventId: event.id,
    experienceLevelId: catalog.level.id,
    hasPresentation: input.hasPresentation,
    modalityId: catalog.modality.id,
    musicStorageKey: input.musicStorageKey,
    name: input.name,
    scheduleCapacityId: catalog.scheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });

  return { choreography, event, owner };
}
