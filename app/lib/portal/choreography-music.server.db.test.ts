import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import { updateChoreographyMusic } from "@/lib/portal/choreography-music.server";
import { loadChoreographyMusicDownloadUrl } from "@/lib/storage/choreography-music.server";
import {
  createAcademySession,
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

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

        return {
          ok: true as const,
          storageKey: `academies/${input.academyId}/choreographies/${input.choreographyId}/music.ogg`,
        };
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
      loadChoreographyMusicDownloadUrl({
        storage,
        storageKey: `academies/${owner.academyId}/choreographies/${choreography.id}/music.ogg`,
      }),
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

  // Removing the previous object fails after the row already points at the new
  // one, so the replacement cannot be undone: the old byte stays orphaned on
  // the volume, and this log line is the only thing that makes it recoverable.
  test("logs the orphaned key when the previous object cannot be removed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { choreography, event, owner } = await createMusicChoreographyFixture(
      {
        academyName: "Academia Huérfana",
        email: "music.orphan@example.com",
        musicStorageKey: "academies/old/choreographies/old/music.mp3",
        name: "Con música vieja",
      },
    );
    const storage = {
      createMusicSignedUrl: async (storageKey: string) =>
        `signed:${storageKey}`,
      removeMusic: async () => {
        throw new Error("ENOENT: volume unavailable");
      },
      uploadMusic: async (input: {
        academyId: string;
        choreographyId: string;
        file: Blob;
      }) => ({
        ok: true as const,
        storageKey: `academies/${input.academyId}/choreographies/${input.choreographyId}/music.ogg`,
      }),
    };

    await expect(
      updateChoreographyMusic({
        academyId: owner.academyId,
        choreographyId: choreography.id,
        eventId: event.id,
        file: new File(["music"], "musica.ogg", { type: "audio/ogg" }),
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
    expect(errorSpy).toHaveBeenCalledWith("[storage:music:orphan]", {
      choreographyId: choreography.id,
      detail: "ENOENT: volume unavailable",
      storageKey: "academies/old/choreographies/old/music.mp3",
    });
  });

  // Clearing the music runs the same delete without an upload before it, so the
  // orphan is the object the academy just detached.
  test("logs the orphaned key when clearing the music cannot remove the object", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { choreography, event, owner } = await createMusicChoreographyFixture(
      {
        academyName: "Academia Huérfana al Borrar",
        email: "music.orphan.clear@example.com",
        musicStorageKey: "academies/music/current.mp3",
        name: "Sin música, con huérfano",
      },
    );
    const storage = {
      createMusicSignedUrl: async (storageKey: string) =>
        `signed:${storageKey}`,
      removeMusic: async () => {
        throw new Error("EACCES: volume is read-only");
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
    expect(errorSpy).toHaveBeenCalledWith("[storage:music:orphan]", {
      choreographyId: choreography.id,
      detail: "EACCES: volume is read-only",
      storageKey: "academies/music/current.mp3",
    });
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
