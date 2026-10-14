import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { dancers, individuals, professors } from "@/db/schema";
import {
  createDancer,
  createProfessor,
} from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import {
  confirmIndividualLink,
  listIndividualLinkedRosterRows,
  previewIndividualLinkRosterRows,
  revokeIndividualLink,
} from "@/lib/individuals/link.server";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createIndividualUser } from "@/lib/test-support/individuals";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

const documentNumber = "30123456";

describe("the roster rows an individual's link reaches", () => {
  test("reaches none before administration confirms the link", async () => {
    const academy = await seedAcademy("Estudio Sur");
    await createDancer(academy.id, { documentType: "dni", documentNumber });
    const individual = await seedIndividualWithPhoto();

    await expect(
      listIndividualLinkedRosterRows(individual.individualId),
    ).resolves.toEqual([]);
  });

  test("reaches the dancers and professors carrying its document in every academy once confirmed", async () => {
    const sur = await seedAcademy("Estudio Sur");
    const norte = await seedAcademy("Academia Norte");
    const dancer = await createDancer(sur.id, {
      documentType: "dni",
      documentNumber,
      firstName: "Ana",
      lastName: "Pérez",
    });
    const professor = await createProfessor(norte.id, {
      documentType: "dni",
      documentNumber,
      firstName: "Ana",
      lastName: "Pérez",
    });
    await createDancer(norte.id, {
      documentType: "dni",
      documentNumber: "99888777",
    });
    const individual = await seedIndividualWithPhoto();

    await confirm(individual.individualId);

    await expect(
      listIndividualLinkedRosterRows(individual.individualId),
    ).resolves.toEqual([
      {
        academyId: norte.id,
        academyName: "Academia Norte",
        status: "active",
        firstName: "Ana",
        id: professor.id,
        kind: "professor",
        lastName: "Pérez",
      },
      {
        academyId: sur.id,
        academyName: "Estudio Sur",
        status: "active",
        firstName: "Ana",
        id: dancer.id,
        kind: "dancer",
        lastName: "Pérez",
      },
    ]);
  });

  test("reaches none once the individual changes its document", async () => {
    const academy = await seedAcademy("Estudio Sur");
    await createDancer(academy.id, { documentType: "dni", documentNumber });
    const individual = await seedIndividualWithPhoto();
    await confirm(individual.individualId);

    await db
      .update(individuals)
      .set({ documentNumber: "30123457" })
      .where(eq(individuals.id, individual.individualId));

    await expect(
      listIndividualLinkedRosterRows(individual.individualId),
    ).resolves.toEqual([]);
  });

  test("reaches none once administration revokes the link", async () => {
    const academy = await seedAcademy("Estudio Sur");
    await createDancer(academy.id, { documentType: "dni", documentNumber });
    const individual = await seedIndividualWithPhoto();
    await confirm(individual.individualId);

    await expect(
      revokeIndividualLink(individual.individualId),
    ).resolves.toEqual({ ok: true });

    await expect(
      listIndividualLinkedRosterRows(individual.individualId),
    ).resolves.toEqual([]);
  });

  test("reaches none while the individual has no document photo, even confirmed", async () => {
    const academy = await seedAcademy("Estudio Sur");
    await createDancer(academy.id, { documentType: "dni", documentNumber });
    const individual = await seedIndividualWithPhoto();
    await confirm(individual.individualId);

    await db
      .update(individuals)
      .set({ documentPhotoStorageKey: null })
      .where(eq(individuals.id, individual.individualId));

    await expect(
      listIndividualLinkedRosterRows(individual.individualId),
    ).resolves.toEqual([]);
  });

  test("reads the academy's deletions, archiving and renumbering on the next read", async () => {
    const academy = await seedAcademy("Estudio Sur");
    const deleted = await createDancer(academy.id, {
      documentType: "dni",
      documentNumber,
    });
    const archived = await createProfessor(academy.id, {
      documentType: "dni",
      documentNumber,
    });
    const other = await seedAcademy("Academia Norte");
    const renumbered = await createDancer(other.id, {
      documentType: "dni",
      documentNumber,
    });
    const individual = await seedIndividualWithPhoto();
    await confirm(individual.individualId);

    await db.delete(dancers).where(eq(dancers.id, deleted.id));
    await db
      .update(professors)
      .set({ active: false })
      .where(eq(professors.id, archived.id));
    await db
      .update(dancers)
      .set({ documentNumber: "11222333" })
      .where(eq(dancers.id, renumbered.id));

    const rows = await listIndividualLinkedRosterRows(individual.individualId);

    // An archived row is still the person's: `Estado de alta` does not matter.
    expect(rows.map((row) => [row.id, row.status])).toEqual([
      [archived.id, "archived"],
    ]);
  });

  test("matches a number loaded with its dots against one typed without", async () => {
    const academy = await seedAcademy("Estudio Sur");
    const formatted = await createDancer(academy.id, {
      documentType: "dni",
      documentNumber: "30.123.456",
    });
    const spaced = await createProfessor(academy.id, {
      documentType: "other",
      documentNumber: "30 123 456",
    });
    const individual = await seedIndividualWithPhoto();
    await confirm(individual.individualId);

    const rows = await listIndividualLinkedRosterRows(individual.individualId);

    expect(rows.map((row) => row.id)).toEqual([formatted.id, spaced.id]);
  });

  test("never matches a number that is only separators", async () => {
    const academy = await seedAcademy("Estudio Sur");
    await createDancer(academy.id, {
      documentType: "other",
      documentNumber: "- -",
    });
    const individual = await createIndividualUser({
      documentNumber: ".-.",
      documentPhotoStorageKey: "individuals/photo.jpg",
      documentType: "other",
      email: `particular.${crypto.randomUUID()}@example.com`,
    });
    await confirm(individual.individualId, ".-.");

    await expect(
      listIndividualLinkedRosterRows(individual.individualId),
    ).resolves.toEqual([]);
    await expect(
      previewIndividualLinkRosterRows(individual.individualId),
    ).resolves.toEqual([]);
  });

  test("never reaches a row an individual's own owner row holds", async () => {
    const owner = await createAcademyUser({
      academyName: "Otra Particular",
      email: `otra.${crypto.randomUUID()}@example.com`,
      kind: "individual",
    });
    await createDancer(owner.academyId, {
      documentType: "dni",
      documentNumber,
    });
    const individual = await seedIndividualWithPhoto();
    await confirm(individual.individualId);

    await expect(
      listIndividualLinkedRosterRows(individual.individualId),
    ).resolves.toEqual([]);
  });
});

describe("what administration reads before confirming", () => {
  test("previews the rows the document would reach while the link is pending", async () => {
    const academy = await seedAcademy("Estudio Sur");
    const dancer = await createDancer(academy.id, {
      documentType: "dni",
      documentNumber,
    });
    const individual = await seedIndividualWithPhoto();

    const rows = await previewIndividualLinkRosterRows(individual.individualId);

    expect(rows.map((row) => row.id)).toEqual([dancer.id]);
  });
});

describe("confirming the link", () => {
  test("refuses a number the individual no longer holds", async () => {
    const individual = await seedIndividualWithPhoto();
    const admin = await seedAdmin();

    await expect(
      confirmIndividualLink({
        confirmedByUserId: admin.userId,
        documentNumber: "99888777",
        documentPhotoStorageKey: photoKey,
        individualId: individual.individualId,
      }),
    ).resolves.toEqual({ ok: false, reason: "document-changed" });
  });

  test("refuses a photo the individual replaced after administration read it", async () => {
    const individual = await seedIndividualWithPhoto();
    const admin = await seedAdmin();

    await expect(
      confirmIndividualLink({
        confirmedByUserId: admin.userId,
        documentNumber,
        documentPhotoStorageKey: "individuals/older-photo.jpg",
        individualId: individual.individualId,
      }),
    ).resolves.toEqual({ ok: false, reason: "photo-changed" });
    await expect(
      listIndividualLinkedRosterRows(individual.individualId),
    ).resolves.toEqual([]);
  });

  test("refuses an individual without a document photo", async () => {
    const individual = await createIndividualUser({
      documentNumber,
      email: `particular.${crypto.randomUUID()}@example.com`,
    });
    const admin = await seedAdmin();

    await expect(
      confirmIndividualLink({
        confirmedByUserId: admin.userId,
        documentNumber,
        documentPhotoStorageKey: photoKey,
        individualId: individual.individualId,
      }),
    ).resolves.toEqual({ ok: false, reason: "missing-photo" });
  });
});

describe("revoking the link", () => {
  test("says when there is no such individual", async () => {
    await expect(revokeIndividualLink(crypto.randomUUID())).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

async function seedAdmin() {
  return await createSignedInRequest({
    email: `admin.${crypto.randomUUID()}@example.com`,
    role: "admin",
  });
}

async function seedAcademy(academyName: string) {
  return await createAcademyRecord({
    academyName,
    email: `academia.${crypto.randomUUID()}@example.com`,
  });
}

const photoKey = "individuals/photo.jpg";

async function seedIndividualWithPhoto() {
  return await createIndividualUser({
    documentNumber,
    documentPhotoStorageKey: photoKey,
    email: `particular.${crypto.randomUUID()}@example.com`,
  });
}

async function confirm(individualId: string, number = documentNumber) {
  const admin = await seedAdmin();
  const result = await confirmIndividualLink({
    confirmedByUserId: admin.userId,
    documentNumber: number,
    documentPhotoStorageKey: photoKey,
    individualId,
  });

  expect(result).toEqual({ ok: true });
}
