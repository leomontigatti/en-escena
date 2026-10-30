import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  choreographyProfessors,
  dancers,
  presentations,
  scores,
  user,
} from "@/db/schema";
import { loadIndividualCertificate } from "@/features/individual/choreographies/certificate/server";
import { loadIndividualChoreographies } from "@/features/individual/choreographies/server";
import {
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createProfessor,
} from "@/features/portal/choreographies/test-support/db";
import { loadPortalPresentationEvaluation } from "@/features/portal/presentations/detail/server";
import { expectThrownResponse } from "@/features/portal/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import { countPdfPages } from "@/lib/certificates/certificates.test-support";
import { confirmIndividualLink } from "@/lib/individuals/link.server";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { publishResults } from "@/lib/judging/results.server";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createSavedEvent } from "@/lib/test-support/events";
import { createIndividualUser } from "@/lib/test-support/individuals";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

const documentNumber = "30123456";

type JudgingFixture = Awaited<ReturnType<typeof seedJudgingFixture>>;

describe("loadIndividualChoreographies", () => {
  test("reads nothing and says why while the link is not confirmed", async () => {
    const fixture = await seedJudgingFixture();
    const choreography = await addChoreography(fixture, {
      academyId: fixture.academy.academy.id,
      name: "Solo de Ana",
    });
    await inscribeDancer(fixture.academy.academy.id, choreography.id);
    const unlinked = await createIndividualUser({
      documentNumber,
      email: "sin-vincular@example.com",
    });
    const pending = await createIndividualUser({
      documentNumber,
      documentPhotoStorageKey: "individuals/photo.jpg",
      email: "pendiente@example.com",
    });

    await expect(load(unlinked.cookie)).resolves.toEqual({
      choreographies: [],
      hasActiveEvent: true,
      linkState: "unlinked",
    });
    await expect(load(pending.cookie)).resolves.toEqual({
      choreographies: [],
      hasActiveEvent: true,
      linkState: "pending",
    });
  });

  test("lists the active event's choreographies it dances in or teaches, in every academy", async () => {
    const fixture = await seedJudgingFixture();
    const sur = fixture.academy.academy.id;
    const norte = (await seedAcademy("Academia Norte")).id;
    const danced = await addChoreography(fixture, {
      academyId: sur,
      name: "Solo de Ana",
    });
    const taught = await addChoreography(fixture, {
      academyId: norte,
      name: "Grupal Norte",
    });
    const withdrawnFrom = await addChoreography(fixture, {
      academyId: sur,
      name: "Dúo Retirado",
    });
    const notHers = await addChoreography(fixture, {
      academyId: sur,
      name: "Ajena",
    });
    const dancer = await inscribeDancer(sur, danced.id);
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: withdrawnFrom.id,
      dancerId: dancer.id,
      withdrawnAt: new Date(),
    });
    await inscribeDancer(sur, notHers.id, "99888777");
    const professor = await createProfessor(norte, {
      documentNumber: "30.123.456",
      documentType: "dni",
    });
    await db
      .insert(choreographyProfessors)
      .values({ choreographyId: taught.id, professorId: professor.id });
    await addPastEventChoreography(sur, dancer.id);
    const individual = await seedLinkedIndividual();

    const loaderData = await load(individual.cookie);

    expect(loaderData.linkState).toBe("linked");
    expect(
      loaderData.choreographies.map((row) => [
        row.academyName,
        row.name,
        row.roles,
        row.result,
      ]),
    ).toEqual([
      ["Academia Norte", "Grupal Norte", ["professor"], null],
      ["Academia Pirueta", "Solo de Ana", ["dancer"], null],
    ]);
  });

  test("leaves out the choreographies of a row its academy archived", async () => {
    const fixture = await seedJudgingFixture();
    const academyId = fixture.academy.academy.id;
    const danced = await addChoreography(fixture, {
      academyId,
      name: "Solo Archivado",
    });
    const taught = await addChoreography(fixture, {
      academyId,
      name: "Grupal Archivada",
    });
    const dancer = await inscribeDancer(academyId, danced.id);
    await db
      .update(dancers)
      .set({ active: false })
      .where(eq(dancers.id, dancer.id));
    const professor = await createProfessor(academyId, {
      active: false,
      documentNumber,
      documentType: "dni",
    });
    await db
      .insert(choreographyProfessors)
      .values({ choreographyId: taught.id, professorId: professor.id });
    const individual = await seedLinkedIndividual();

    await expect(load(individual.cookie)).resolves.toEqual({
      choreographies: [],
      hasActiveEvent: true,
      linkState: "linked",
    });
  });

  test("shows a published result as the owning academy reads it, and none while unpublished", async () => {
    const fixture = await seedJudgingFixture();
    const academyId = fixture.academy.academy.id;
    const published = await fixture.addPresentation({
      name: "Publicada",
      orderNumber: 1,
    });
    const dancer = await inscribeDancer(academyId, published.choreographyId);
    await score(fixture, published.presentationId, ["90", "95"]);
    await publishResults(fixture.event.id);
    // Evaluated after publishing, so outside the snapshot.
    const late = await fixture.addPresentation({
      name: "Tardía",
      orderNumber: 2,
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: late.choreographyId,
      dancerId: dancer.id,
    });
    await score(fixture, late.presentationId, ["70"]);
    const individual = await seedLinkedIndividual();

    const loaderData = await load(individual.cookie);
    const academyReads = await loadPortalPresentationEvaluation({
      params: { choreographyId: published.choreographyId },
      request: signedInRequest(fixture.academy.cookie),
    });

    expect(
      loaderData.choreographies.map((row) => [row.name, row.result]),
    ).toEqual([
      [
        "Publicada",
        {
          judges: academyReads.judges.map((judge) => ({
            judgeId: judge.judgeId,
            judgeName: judge.judgeName,
            value: judge.value,
          })),
          result: academyReads.result,
        },
      ],
      ["Tardía", null],
    ]);
    expect(loaderData.choreographies[0]?.result?.result).toEqual({
      average: 92.5,
      award: "gold",
      kind: "scored",
    });
  });

  test("offers a certificate only where it danced in a published choreography that took an award", async () => {
    await seedCertificateChoreographies();
    const individual = await seedLinkedIndividual();

    const loaderData = await load(individual.cookie);

    expect(
      loaderData.choreographies.map((row) => [row.name, row.hasCertificate]),
    ).toEqual([
      ["Descalificada", false],
      ["Enseñada", false],
      ["Premiada", true],
      ["Tardía", false],
    ]);
  });

  test("answers with no event when none is active", async () => {
    const individual = await seedLinkedIndividual();

    await expect(load(individual.cookie)).resolves.toEqual({
      choreographies: [],
      hasActiveEvent: false,
      linkState: "linked",
    });
  });

  test("refuses an academy", async () => {
    const academy = await createAcademyUser({
      academyName: "Academia Propia",
      email: "academia.propia@example.com",
    });

    await expectThrownResponse(load(academy.cookie), 403);
  });
});

describe("loadIndividualCertificate", () => {
  test("opens its own certificate, a single page named after its roster row", async () => {
    const { awarded } = await seedCertificateChoreographies();
    const individual = await seedLinkedIndividual();

    const response = await loadCertificate(individual.cookie, awarded);

    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'inline; filename="certificado-ana-paz-premiada.pdf"',
    );
    expect(countPdfPages(new Uint8Array(await response.arrayBuffer()))).toBe(1);
  });

  test("answers not found where it only teaches, or with no award", async () => {
    const { disqualified, taught } = await seedCertificateChoreographies();
    const individual = await seedLinkedIndividual();

    await expectThrownResponse(loadCertificate(individual.cookie, taught), 404);
    await expectThrownResponse(
      loadCertificate(individual.cookie, disqualified),
      404,
    );
  });

  test("answers not found while the link is not confirmed", async () => {
    const { awarded } = await seedCertificateChoreographies();
    const unlinked = await createIndividualUser({
      documentNumber,
      email: "sin-vincular@example.com",
    });

    await expectThrownResponse(loadCertificate(unlinked.cookie, awarded), 404);
  });
});

/**
 * Four choreographies the individual's document reaches: `Premiada` it dances
 * and is published with an award, `Descalificada` it dances and is
 * disqualified, `Enseñada` it only teaches, and `Tardía` it dances, scored
 * after the results went out.
 */
async function seedCertificateChoreographies() {
  const fixture = await seedJudgingFixture();
  const academyId = fixture.academy.academy.id;
  const add = async (name: string, orderNumber: number) => {
    const presentation = await fixture.addPresentation({ name, orderNumber });
    await score(fixture, presentation.presentationId, ["85"]);

    return presentation;
  };
  const awarded = await add("Premiada", 1);
  const dancer = await inscribeDancer(academyId, awarded.choreographyId);
  const inscribe = async (choreographyId: string) => {
    await db
      .insert(choreographyDancers)
      .values({ ageAtEventStart: 14, choreographyId, dancerId: dancer.id });
  };
  const disqualified = await add("Descalificada", 2);
  await inscribe(disqualified.choreographyId);
  await db
    .update(presentations)
    .set({ disqualifiedAt: new Date() })
    .where(eq(presentations.id, disqualified.presentationId));
  const taught = await add("Enseñada", 3);
  const professor = await createProfessor(academyId, {
    documentNumber,
    documentType: "dni",
  });
  await db.insert(choreographyProfessors).values({
    choreographyId: taught.choreographyId,
    professorId: professor.id,
  });
  await publishResults(fixture.event.id);
  const late = await add("Tardía", 4);
  await inscribe(late.choreographyId);

  return {
    awarded: awarded.choreographyId,
    disqualified: disqualified.choreographyId,
    fixture,
    taught: taught.choreographyId,
  };
}

async function loadCertificate(cookie: string, choreographyId: string) {
  return await loadIndividualCertificate({
    params: { choreographyId },
    request: new Request(
      `http://localhost/particular/coreografias/${choreographyId}/certificado`,
      { headers: { cookie } },
    ),
  });
}

async function load(cookie: string) {
  return await loadIndividualChoreographies(signedInRequest(cookie));
}

function signedInRequest(cookie: string) {
  return new Request("http://localhost/particular/coreografias", {
    headers: { cookie },
  });
}

async function seedAcademy(academyName: string) {
  return await createAcademyRecord({
    academyName,
    email: `academia.${crypto.randomUUID()}@example.com`,
  });
}

async function addChoreography(
  fixture: JudgingFixture,
  input: { academyId: string; name: string },
) {
  return await createChoreographyRecord({
    academyId: input.academyId,
    categoryId: fixture.catalog.categoryWithLevel.id,
    eventId: fixture.event.id,
    experienceLevelId: fixture.catalog.level.id,
    modalityId: fixture.catalog.modality.id,
    name: input.name,
    scheduleCapacityId: fixture.catalog.scheduleCapacity.id,
  });
}

/** A dancer carrying the individual's document (or another), inscribed. */
async function inscribeDancer(
  academyId: string,
  choreographyId: string,
  dancerDocumentNumber = documentNumber,
) {
  const dancer = await createDancer(academyId, {
    documentNumber: dancerDocumentNumber,
    documentType: "dni",
  });
  await db
    .insert(choreographyDancers)
    .values({ ageAtEventStart: 14, choreographyId, dancerId: dancer.id });

  return dancer;
}

async function addPastEventChoreography(academyId: string, dancerId: string) {
  const pastEvent = await createSavedEvent({
    active: false,
    name: "En Escena 2025",
  });
  const catalog = await createEventCatalog(pastEvent.id);
  const choreography = await createChoreographyRecord({
    academyId,
    categoryId: catalog.categoryWithLevel.id,
    eventId: pastEvent.id,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    name: "Evento pasado",
    scheduleCapacityId: catalog.scheduleCapacity.id,
  });
  await db
    .insert(choreographyDancers)
    .values({ ageAtEventStart: 13, choreographyId: choreography.id, dancerId });
}

async function score(
  fixture: JudgingFixture,
  presentationId: string,
  values: string[],
) {
  for (const [index, value] of values.entries()) {
    // Named apart, so the panel reads in one order on every surface.
    const [judge] = await db
      .insert(user)
      .values({
        email: `${crypto.randomUUID()}@example.com`,
        name: `Juez ${index + 1}`,
        role: "judge",
      })
      .returning();
    const { judgeAssignmentId } = await fixture.assignJudge(
      presentationId,
      judge.id,
    );
    await db.insert(scores).values({ judgeAssignmentId, value });
  }
}

async function seedLinkedIndividual() {
  const individual = await createIndividualUser({
    documentNumber,
    documentPhotoStorageKey: "individuals/photo.jpg",
    email: `particular.${crypto.randomUUID()}@example.com`,
  });
  const admin = await createSignedInRequest({
    email: `admin.${crypto.randomUUID()}@example.com`,
    role: "admin",
  });
  const confirmation = await confirmIndividualLink({
    confirmedByUserId: admin.userId,
    documentNumber,
    documentPhotoStorageKey: "individuals/photo.jpg",
    individualId: individual.individualId,
  });

  expect(confirmation).toEqual({ ok: true });

  return individual;
}
