import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { academies } from "@/db/schema";
import {
  handleIndividualPersonalDataAction,
  loadIndividualPersonalData,
} from "@/features/individual/personal-data/server";
import {
  createPortalPostRequest,
  expectThrownResponse,
} from "@/features/portal/test-support/db";
import {
  confirmIndividualLink,
  revokeIndividualLink,
} from "@/lib/individuals/link.server";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createIndividualUser } from "@/lib/test-support/individuals";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

const bucket = "en-escena-individual-documents";

installDatabaseTestHooks();

let storageVolumeDir = "";

// A temporary storage volume behind the app's own storage client.
beforeEach(async () => {
  storageVolumeDir = await mkdtemp(join(tmpdir(), "en-escena-individuals-"));
  vi.stubEnv("STORAGE_VOLUME_DIR", storageVolumeDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(storageVolumeDir, { force: true, recursive: true });
});

const profileUrl = "http://localhost/particular/perfil";

describe("the individual's `Perfil`", () => {
  test("loads the individual's personal data, its phone and its access email", async () => {
    const individual = await createIndividualUser({
      documentNumber: "30123456",
      email: "particular@example.com",
      firstName: "Ana",
      lastName: "Pérez",
      phone: "3511234567",
    });

    await expect(
      loadIndividualPersonalData(
        new Request(profileUrl, { headers: { cookie: individual.cookie } }),
      ),
    ).resolves.toEqual({
      documentPhotoUrl: null,
      email: "particular@example.com",
      linkState: "unlinked",
      values: {
        documentNumber: "30123456",
        documentPhotoStorageKey: "",
        documentType: "dni",
        firstName: "Ana",
        lastName: "Pérez",
        phone: "3511234567",
      },
    });
  });

  test("saves the name, the document normalized and the phone, and renames the owner row", async () => {
    const individual = await createIndividualUser({
      email: "particular@example.com",
    });

    const result = await handleIndividualPersonalDataAction(
      createPortalPostRequest(
        profileUrl,
        individual.cookie,
        personalDataForm({
          documentNumber: " 40 111.222 ",
          documentType: "dni",
          firstName: "maría  josé",
          lastName: "del valle",
          phone: "1198765432",
        }),
      ),
    );

    expect(result).toEqual({ status: "success", message: "Datos guardados." });
    await expect(loadProfile(individual.cookie)).resolves.toMatchObject({
      values: {
        documentNumber: "40111222",
        documentType: "dni",
        firstName: "María José",
        lastName: "del Valle",
        phone: "1198765432",
      },
    });
    // No reader shows the owner row's names, so they are read directly.
    await expect(
      db.query.academies.findFirst({
        columns: { contactName: true, name: true },
        where: eq(academies.id, individual.ownerId),
      }),
    ).resolves.toEqual({
      contactName: "María José del Valle",
      name: "María José del Valle",
    });
  });

  test("returns the field errors with what was typed and saves nothing", async () => {
    const individual = await createIndividualUser({
      email: "particular@example.com",
      firstName: "Ana",
    });
    const typed = {
      documentNumber: "",
      documentType: "dni",
      firstName: "...",
      lastName: "Pérez",
      phone: "11 9999 0000",
    };

    const result = await handleIndividualPersonalDataAction(
      createPortalPostRequest(
        profileUrl,
        individual.cookie,
        personalDataForm(typed),
      ),
    );

    expect(result).toEqual({
      status: "error",
      message: "Revisá los datos del formulario.",
      fieldErrors: {
        documentNumber: "Ingresá el número de documento.",
        firstName: "Ingresá al menos una letra o un número.",
        phone: "Ingresá 10 dígitos, sin espacios, 0 ni 15.",
      },
      values: { ...typed, documentPhotoStorageKey: "" },
    });
    await expect(loadProfile(individual.cookie)).resolves.toMatchObject({
      values: { documentNumber: "30123456", firstName: "Ana" },
    });
  });

  test("refuses an academy, which has no personal data here", async () => {
    const academy = await createAcademyUser({
      academyName: "Academia Propia",
      email: "academia@example.com",
    });

    await expectThrownResponse(
      handleIndividualPersonalDataAction(
        createPortalPostRequest(
          profileUrl,
          academy.cookie,
          personalDataForm({
            documentNumber: "30123456",
            documentType: "dni",
            firstName: "Ana",
            lastName: "Pérez",
            phone: "3511234567",
          }),
        ),
      ),
      403,
    );
  });
});

describe("the individual's document photo", () => {
  test("uploading the photo moves the link from `Sin vincular` to `Pendiente`", async () => {
    const individual = await createIndividualUser({
      email: "particular@example.com",
    });

    const before = await loadProfile(individual.cookie);

    expect(before.linkState).toBe("unlinked");
    expect(before.documentPhotoUrl).toBeNull();

    const result = await saveProfile(individual.cookie, {
      documentPhoto: new File(["front"], "dni.jpg", { type: "image/jpeg" }),
    });

    expect(result).toEqual({ status: "success", message: "Datos guardados." });

    const [storedPhoto] = await storedPhotos(individual.individualId);
    const after = await loadProfile(individual.cookie);

    expect(storedPhoto).toMatch(/^document-.+\.jpg$/);
    expect(after.linkState).toBe("pending");
    expect(after.values.documentPhotoStorageKey).toBe(
      `individuals/${individual.individualId}/${storedPhoto}`,
    );
    expect(after.documentPhotoUrl).toContain(
      encodeURIComponent(after.values.documentPhotoStorageKey),
    );
  });

  test("replacing the photo keeps only the new one", async () => {
    const individual = await createIndividualUser({
      email: "particular@example.com",
    });

    await saveProfile(individual.cookie, {
      documentPhoto: new File(["first"], "dni.jpg", { type: "image/jpeg" }),
    });
    const first = await loadProfile(individual.cookie);
    const result = await saveProfile(individual.cookie, {
      documentPhoto: new File(["second"], "dni.png", { type: "image/png" }),
      documentPhotoStorageKey: first.values.documentPhotoStorageKey,
    });

    const photos = await storedPhotos(individual.individualId);
    const second = await loadProfile(individual.cookie);

    expect(result.status).toBe("success");
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatch(/\.png$/);
    expect(second.values.documentPhotoStorageKey).toBe(
      `individuals/${individual.individualId}/${photos[0]}`,
    );
    expect(second.linkState).toBe("pending");
  });

  test("a save that does not touch the photo keeps it", async () => {
    const individual = await createIndividualUser({
      email: "particular@example.com",
    });

    await saveProfile(individual.cookie, {
      documentPhoto: new File(["first"], "dni.jpg", { type: "image/jpeg" }),
    });
    const stored = await loadProfile(individual.cookie);

    await saveProfile(individual.cookie, {
      documentPhotoStorageKey: stored.values.documentPhotoStorageKey,
    });
    await saveProfile(individual.cookie, {});

    await expect(storedPhotos(individual.individualId)).resolves.toHaveLength(
      1,
    );
    await expect(loadProfile(individual.cookie)).resolves.toMatchObject({
      linkState: "pending",
      values: {
        documentPhotoStorageKey: stored.values.documentPhotoStorageKey,
      },
    });
  });

  test("removing the photo goes back to `Sin vincular`", async () => {
    const individual = await createIndividualUser({
      email: "particular@example.com",
    });

    await saveProfile(individual.cookie, {
      documentPhoto: new File(["first"], "dni.jpg", { type: "image/jpeg" }),
    });
    await saveProfile(individual.cookie, { documentPhotoStorageKey: "" });

    await expect(storedPhotos(individual.individualId)).resolves.toEqual([]);
    await expect(loadProfile(individual.cookie)).resolves.toMatchObject({
      documentPhotoUrl: null,
      linkState: "unlinked",
    });
  });

  test("refuses a file that is not an image and saves nothing", async () => {
    const individual = await createIndividualUser({
      email: "particular@example.com",
      firstName: "Ana",
    });

    const result = await saveProfile(individual.cookie, {
      documentPhoto: new File(["%PDF"], "dni.pdf", {
        type: "application/pdf",
      }),
      firstName: "Lucía",
    });

    expect(result).toMatchObject({
      status: "error",
      message: "La foto del documento debe ser JPG, PNG o WEBP.",
      values: { documentPhotoStorageKey: "", firstName: "Lucía" },
    });
    await expect(storedPhotos(individual.individualId)).resolves.toEqual([]);
    await expect(loadProfile(individual.cookie)).resolves.toMatchObject({
      linkState: "unlinked",
      values: { firstName: "Ana" },
    });
  });
});

describe("the individual's link in `Perfil`", () => {
  test("reads `Vinculado` once administration confirms the document", async () => {
    const individual = await createLinkedIndividual();

    await expect(loadProfile(individual.cookie)).resolves.toMatchObject({
      linkState: "linked",
    });
  });

  test("a document change takes the link back to `Pendiente`", async () => {
    const individual = await createLinkedIndividual();
    const stored = await loadProfile(individual.cookie);

    const result = await saveProfile(individual.cookie, {
      documentNumber: "30.123.457",
      documentPhotoStorageKey: stored.values.documentPhotoStorageKey,
    });

    expect(result.status).toBe("success");
    await expect(loadProfile(individual.cookie)).resolves.toMatchObject({
      linkState: "pending",
    });
  });

  test("a save that keeps the document, however typed, keeps the link", async () => {
    const individual = await createLinkedIndividual();
    const stored = await loadProfile(individual.cookie);

    await saveProfile(individual.cookie, {
      documentNumber: "30.123.456",
      documentPhotoStorageKey: stored.values.documentPhotoStorageKey,
      phone: "1198765432",
    });

    await expect(loadProfile(individual.cookie)).resolves.toMatchObject({
      linkState: "linked",
    });
  });

  test("a revocation takes the link back to `Pendiente`", async () => {
    const individual = await createLinkedIndividual();

    await expect(
      revokeIndividualLink(individual.individualId),
    ).resolves.toEqual({ ok: true });

    await expect(loadProfile(individual.cookie)).resolves.toMatchObject({
      linkState: "pending",
    });
  });
});

/** An individual with a photo whose link administration confirmed. */
async function createLinkedIndividual() {
  const individual = await createIndividualUser({
    documentNumber: "30123456",
    email: "particular@example.com",
  });

  await saveProfile(individual.cookie, {
    documentPhoto: new File(["front"], "dni.jpg", { type: "image/jpeg" }),
  });

  const admin = await createSignedInRequest({
    email: "admin@example.com",
    role: "admin",
  });
  const stored = await loadProfile(individual.cookie);
  const confirmed = await confirmIndividualLink({
    confirmedByUserId: admin.userId,
    documentNumber: "30123456",
    documentPhotoStorageKey: stored.values.documentPhotoStorageKey,
    individualId: individual.individualId,
  });

  expect(confirmed).toEqual({ ok: true });

  return individual;
}

async function loadProfile(cookie: string) {
  return loadIndividualPersonalData(
    new Request(profileUrl, { headers: { cookie } }),
  );
}

/** The `Perfil` form as the individual submits it, with valid data. */
async function saveProfile(
  cookie: string,
  overrides: Record<string, File | string>,
) {
  const formData = personalDataForm({
    documentNumber: "30123456",
    documentType: "dni",
    firstName: "Ana",
    lastName: "Pérez",
    phone: "3511234567",
  });

  for (const [name, value] of Object.entries(overrides)) {
    formData.set(name, value);
  }

  return handleIndividualPersonalDataAction(
    createPortalPostRequest(profileUrl, cookie, formData),
  );
}

async function storedPhotos(individualId: string) {
  try {
    return (
      await readdir(join(storageVolumeDir, bucket, "individuals", individualId))
    ).sort();
  } catch {
    return [];
  }
}

function personalDataForm(values: Record<string, string>) {
  const formData = new FormData();

  for (const [name, value] of Object.entries(values)) {
    formData.set(name, value);
  }

  return formData;
}
