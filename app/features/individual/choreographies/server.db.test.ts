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
          average: academyReads.average,
          award: academyReads.award,
          disqualified: false,
          scores: academyReads.judges.map((judge) => ({
            judgeId: judge.judgeId,
            judgeName: judge.judgeName,
            value: judge.value,
          })),
        },
      ],
      ["Tardía", null],
    ]);
    expect(loaderData.choreographies[0]?.result).toMatchObject({
      average: 92.5,
      award: "gold",
    });
  });

  test("shows a published disqualification with no figures", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Descalificada",
      orderNumber: 1,
    });
    await inscribeDancer(
      fixture.academy.academy.id,
      presentation.choreographyId,
    );
    await score(fixture, presentation.presentationId, ["95"]);
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date() })
      .where(eq(presentations.id, presentation.presentationId));
    await publishResults(fixture.event.id);
    const individual = await seedLinkedIndividual();

    const loaderData = await load(individual.cookie);

    expect(loaderData.choreographies.map((row) => row.result)).toEqual([
      {
        average: null,
        award: null,
        disqualified: true,
        scores: [],
      },
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

async function load(cookie: string) {
  return await loadIndividualChoreographies(signedInRequest(cookie));
}

function signedInRequest(cookie: string) {
  return new Request("http://localhost/particular/mis-coreografias", {
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
    individualId: individual.individualId,
  });

  expect(confirmation).toEqual({ ok: true });

  return individual;
}
