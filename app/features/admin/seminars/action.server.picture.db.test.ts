import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  createSavedEvent,
  createSignedInRequest,
} from "@/lib/admin/finances/finances.test-support";
import { createSeminar, getSeminar } from "@/lib/seminars/repository.server";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

import { handleSeminarDetailAction } from "./action.server";
import { loadSeminarDetailData } from "./server";
import {
  keptSeminarPictureValue,
  seminarPictureFileField,
  seminarPictureKeptField,
  seminarPicturePresentField,
} from "./shared";

const bucket = "enescena-seminar-pictures";
const storageState = vi.hoisted(() => ({ baseDir: "" }));

// Only the factory is replaced, and by the real filesystem store over a
// temporary volume: the key layout, the policy and the replacement ordering
// stay real, so this test cannot drift from them.
vi.mock("@/lib/storage/seminar-pictures.server", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/storage/seminar-pictures.server")
    >();

  return {
    ...original,
    createDefaultSeminarPictureStorage: () =>
      original.createFilesystemSeminarPictureStorage({
        baseDir: storageState.baseDir,
        now: () => 1_000_000,
        secret: "volume-signing-secret",
      }),
  };
});

installDatabaseTestHooks();

beforeEach(async () => {
  storageState.baseDir = await mkdtemp(join(tmpdir(), "en-escena-seminars-"));
});

afterEach(async () => {
  await rm(storageState.baseDir, { force: true, recursive: true });
});

const seminarFields = {
  instructorName: "Abril Sosa",
  scheduledDate: "2026-10-10",
  startTime: "18:30",
};

async function createSavedSeminar(eventId: string) {
  const created = await createSeminar(eventId, { ...seminarFields, quota: 20 });

  if (!created.ok) {
    throw new Error(`Expected the seminar fixture: ${created.error}`);
  }

  return created.seminar;
}

/** What the detail form stages for the picture before "Guardar" is pressed. */
type PictureChange =
  | { kind: "absent" }
  | { kind: "keep" }
  | { kind: "remove" }
  | { file: File; kind: "upload" };

async function save(seminarId: string, picture: PictureChange) {
  const url = `http://localhost/administracion/seminarios/${seminarId}`;
  const signedIn = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: "admin",
    requestUrl: url,
  });
  const formData = new FormData();

  formData.set("intent", "update-seminar");
  formData.set("instructorName", seminarFields.instructorName);
  formData.set("scheduledDate", seminarFields.scheduledDate);
  formData.set("startTime", seminarFields.startTime);
  formData.set("quota", "20");

  if (picture.kind !== "absent") {
    formData.set(seminarPicturePresentField, keptSeminarPictureValue);
  }

  if (picture.kind === "keep") {
    formData.set(seminarPictureKeptField, keptSeminarPictureValue);
  }

  if (picture.kind === "upload") {
    formData.set(seminarPictureFileField, picture.file);
  }

  return handleSeminarDetailAction(
    new Request(url, {
      method: "POST",
      body: formData,
      headers: { cookie: signedIn.request.headers.get("cookie") ?? "" },
    }),
    seminarId,
  );
}

function pictureFolder(eventId: string, seminarId: string) {
  return join(
    storageState.baseDir,
    bucket,
    `events/${eventId}/seminars/${seminarId}`,
  );
}

describe.sequential("the seminar instructor picture", () => {
  test("an upload stores one object and records its key on the row", async () => {
    const event = await createSavedEvent();
    const seminar = await createSavedSeminar(event.id);

    const result = await save(seminar.id, {
      kind: "upload",
      file: new File(["picture"], "instructor.jpg", { type: "image/jpeg" }),
    });

    expect(result).toMatchObject({ status: "success" });
    expect((await getSeminar(seminar.id))?.instructorPictureStorageKey).toBe(
      `events/${event.id}/seminars/${seminar.id}/instructor.jpg`,
    );
    expect(await readdir(pictureFolder(event.id, seminar.id))).toEqual([
      "instructor.jpg",
    ]);
  });

  test("replacing a JPG with a PNG leaves exactly one object", async () => {
    const event = await createSavedEvent();
    const seminar = await createSavedSeminar(event.id);

    await save(seminar.id, {
      kind: "upload",
      file: new File(["old"], "instructor.jpg", { type: "image/jpeg" }),
    });
    await save(seminar.id, {
      kind: "upload",
      file: new File(["new"], "instructor.png", { type: "image/png" }),
    });

    expect(await readdir(pictureFolder(event.id, seminar.id))).toEqual([
      "instructor.png",
    ]);
    expect((await getSeminar(seminar.id))?.instructorPictureStorageKey).toBe(
      `events/${event.id}/seminars/${seminar.id}/instructor.png`,
    );
  });

  test("emptying the field deletes the object and nulls the key", async () => {
    const event = await createSavedEvent();
    const seminar = await createSavedSeminar(event.id);

    await save(seminar.id, {
      kind: "upload",
      file: new File(["picture"], "instructor.webp", { type: "image/webp" }),
    });

    expect(await save(seminar.id, { kind: "remove" })).toMatchObject({
      status: "success",
    });
    expect(
      (await getSeminar(seminar.id))?.instructorPictureStorageKey,
    ).toBeNull();
    expect(await readdir(pictureFolder(event.id, seminar.id))).toEqual([]);
  });

  test("a save that keeps the picture leaves it alone", async () => {
    const event = await createSavedEvent();
    const seminar = await createSavedSeminar(event.id);

    await save(seminar.id, {
      kind: "upload",
      file: new File(["picture"], "instructor.jpg", { type: "image/jpeg" }),
    });
    await save(seminar.id, { kind: "keep" });

    expect((await getSeminar(seminar.id))?.instructorPictureStorageKey).toBe(
      `events/${event.id}/seminars/${seminar.id}/instructor.jpg`,
    );
  });

  // Three absent fields look exactly like "remove the picture", and the costly
  // way to be wrong about that is the one that deletes.
  test("a body without the picture fields leaves the picture alone", async () => {
    const event = await createSavedEvent();
    const seminar = await createSavedSeminar(event.id);

    await save(seminar.id, {
      kind: "upload",
      file: new File(["picture"], "instructor.jpg", { type: "image/jpeg" }),
    });
    await save(seminar.id, { kind: "absent" });

    expect((await getSeminar(seminar.id))?.instructorPictureStorageKey).toBe(
      `events/${event.id}/seminars/${seminar.id}/instructor.jpg`,
    );
  });

  test("a refused format is a message about the picture, not a saved key", async () => {
    const event = await createSavedEvent();
    const seminar = await createSavedSeminar(event.id);

    expect(
      await save(seminar.id, {
        kind: "upload",
        file: new File(["pdf"], "instructor.pdf", { type: "application/pdf" }),
      }),
    ).toMatchObject({
      status: "error",
      message: "La foto del instructor debe ser JPG, PNG o WEBP.",
    });
    expect(
      (await getSeminar(seminar.id))?.instructorPictureStorageKey,
    ).toBeNull();
  });

  test("the detail loader signs the stored picture and reads an absent one as none", async () => {
    const event = await createSavedEvent();
    const seminar = await createSavedSeminar(event.id);
    const url = `http://localhost/administracion/seminarios/${seminar.id}`;

    async function loadDetail() {
      const signedIn = await createSignedInRequest({
        email: `${crypto.randomUUID()}@example.com`,
        role: "admin",
        requestUrl: url,
      });

      return loadSeminarDetailData(signedIn.request, seminar.id);
    }

    expect((await loadDetail()).instructorPictureUrl).toBeNull();

    await save(seminar.id, {
      kind: "upload",
      file: new File(["picture"], "instructor.jpg", { type: "image/jpeg" }),
    });

    const signedUrl = (await loadDetail()).instructorPictureUrl ?? "";

    expect(
      new URL(signedUrl, "https://sistema.enescena.com.ar").searchParams.get(
        "key",
      ),
    ).toBe(`events/${event.id}/seminars/${seminar.id}/instructor.jpg`);
  });

  test("deleting the seminar removes its picture object", async () => {
    const event = await createSavedEvent();
    const seminar = await createSavedSeminar(event.id);

    await save(seminar.id, {
      kind: "upload",
      file: new File(["picture"], "instructor.jpg", { type: "image/jpeg" }),
    });

    const url = `http://localhost/administracion/seminarios/${seminar.id}`;
    const signedIn = await createSignedInRequest({
      email: `${crypto.randomUUID()}@example.com`,
      role: "admin",
      requestUrl: url,
    });
    const formData = new FormData();

    formData.set("intent", "delete-seminar");
    formData.set("confirmDeletion", seminar.id);

    await expect(
      handleSeminarDetailAction(
        new Request(url, {
          method: "POST",
          body: formData,
          headers: { cookie: signedIn.request.headers.get("cookie") ?? "" },
        }),
        seminar.id,
      ),
    ).rejects.toBeInstanceOf(Response);

    expect(await readdir(pictureFolder(event.id, seminar.id))).toEqual([]);
    expect(await getSeminar(seminar.id)).toBeNull();
  });
});
