import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  events,
  presentations,
  scores,
  user,
} from "@/db/schema";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { readPresentationResults } from "@/lib/judging/presentation-results.server";
import { hideResults, publishResults } from "@/lib/judging/results.server";
import { createAcademyUser } from "@/lib/test-support/academies";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

type JudgingFixture = Awaited<ReturnType<typeof seedJudgingFixture>>;

async function addScored(
  fixture: JudgingFixture,
  input: { name: string; orderNumber: number; values: string[] },
) {
  const presentation = await fixture.addPresentation({
    name: input.name,
    orderNumber: input.orderNumber,
    submodalityId: null,
  });

  for (const value of input.values) {
    await fixture.scorePresentation(presentation.presentationId, value);
  }

  return presentation;
}

async function disqualify(presentationId: string) {
  await db
    .update(presentations)
    .set({ disqualifiedAt: new Date() })
    .where(eq(presentations.id, presentationId));
}

async function withdraw(choreographyId: string) {
  await db
    .update(choreographies)
    .set({ withdrawnAt: new Date() })
    .where(eq(choreographies.id, choreographyId));
}

describe("the results administration reads", () => {
  test("are live, published or not, and say which the academies see", async () => {
    const fixture = await seedJudgingFixture();
    const early = await addScored(fixture, {
      name: "Temprana",
      orderNumber: 1,
      values: ["80.0", "90.0"],
    });
    await publishResults(fixture.event.id);
    const late = await addScored(fixture, {
      name: "Tardía",
      orderNumber: 2,
      values: ["55.0"],
    });
    const waiting = await fixture.addPresentation({
      name: "Sin evaluar",
      orderNumber: 3,
    });
    const disqualified = await addScored(fixture, {
      name: "Descalificada",
      orderNumber: 4,
      values: ["95.0"],
    });
    await disqualify(disqualified.presentationId);

    const results = await readPresentationResults(
      { kind: "administration" },
      [early, late, waiting, disqualified].map((p) => p.choreographyId),
    );

    expect(results.get(early.choreographyId)).toEqual({
      evaluated: true,
      published: true,
      result: { average: 85, award: "silver", kind: "scored" },
    });
    expect(results.get(late.choreographyId)).toEqual({
      evaluated: true,
      published: false,
      result: { average: 55, award: "specialMention", kind: "scored" },
    });
    expect(results.get(waiting.choreographyId)).toEqual({
      evaluated: false,
      published: false,
      result: { kind: "unscored" },
    });
    expect(results.get(disqualified.choreographyId)).toEqual({
      evaluated: true,
      published: false,
      result: { kind: "disqualified" },
    });
  });

  // A take saved while disqualified has no value, and reinstating keeps it:
  // the panel has evaluated the presentation without anything to average.
  test("say a presentation is evaluated when its only score row has no value", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Reintegrada",
      orderNumber: 1,
    });
    const judge = await fixture.assignJudge(presentation.presentationId);
    await db.insert(scores).values({
      feedbackAudioStorageKey: "takes/a.webm",
      judgeAssignmentId: judge.judgeAssignmentId,
      value: null,
    });

    const results = await readPresentationResults({ kind: "administration" }, [
      presentation.choreographyId,
    ]);

    expect(results.get(presentation.choreographyId)).toEqual({
      evaluated: true,
      published: false,
      result: { kind: "unscored" },
    });
  });

  test("leave out a withdrawn presentation and a choreography with none", async () => {
    const fixture = await seedJudgingFixture();
    const withdrawn = await fixture.addPresentation({
      name: "Retirada",
      orderNumber: 1,
    });
    await withdraw(withdrawn.choreographyId);
    const unknown = crypto.randomUUID();

    const results = await readPresentationResults({ kind: "administration" }, [
      withdrawn.choreographyId,
      unknown,
    ]);

    expect(results.size).toBe(0);
  });
});

describe("the results an academy reads", () => {
  test("are only its own presentations inside a published snapshot", async () => {
    const fixture = await seedJudgingFixture();
    const own = await addScored(fixture, {
      name: "Propia",
      orderNumber: 1,
      values: ["70.0"],
    });
    const foreign = await addScored(fixture, {
      name: "Ajena",
      orderNumber: 2,
      values: ["90.0"],
    });
    const stranger = await createAcademyUser({
      academyName: "Academia Ajena",
      email: `${crypto.randomUUID()}@example.com`,
    });
    await db
      .update(choreographies)
      .set({ academyId: stranger.academy.id })
      .where(eq(choreographies.id, foreign.choreographyId));
    await publishResults(fixture.event.id);
    const evaluatedSince = await addScored(fixture, {
      name: "Evaluada después",
      orderNumber: 3,
      values: ["88.0"],
    });

    const results = await readPresentationResults(
      { academyId: fixture.academy.academy.id, kind: "academy" },
      [own, foreign, evaluatedSince].map((p) => p.choreographyId),
    );

    expect([...results.keys()]).toEqual([own.choreographyId]);
    expect(results.get(own.choreographyId)).toEqual({
      result: { average: 70, award: "bronze", kind: "scored" },
    });
  });

  test("are gone once results are hidden, and while the event's stamp is lifted", async () => {
    const fixture = await seedJudgingFixture();
    const scored = await addScored(fixture, {
      name: "Primera",
      orderNumber: 1,
      values: ["70.0"],
    });
    const audience = {
      academyId: fixture.academy.academy.id,
      kind: "academy",
    } as const;

    await publishResults(fixture.event.id);
    await hideResults(fixture.event.id);
    expect(
      (await readPresentationResults(audience, [scored.choreographyId])).size,
    ).toBe(0);

    await publishResults(fixture.event.id);
    // The presentation keeps its own stamp: only the event's goes.
    await db
      .update(events)
      .set({ resultsPublishedAt: null })
      .where(eq(events.id, fixture.event.id));
    expect(
      (await readPresentationResults(audience, [scored.choreographyId])).size,
    ).toBe(0);
  });
});

describe("the results an individual reads", () => {
  test("carry each judge who scored, by name, and none on a disqualification", async () => {
    const fixture = await seedJudgingFixture();
    const scored = await fixture.addPresentation({
      name: "Con puntaje",
      orderNumber: 1,
      submodalityId: null,
    });
    const zulema = await fixture.assignJudge(scored.presentationId);
    const ana = await fixture.assignJudge(scored.presentationId);
    // Assigned but silent: nobody's result.
    await fixture.assignJudge(scored.presentationId);
    await db
      .update(user)
      .set({ name: "Zulema Juez" })
      .where(eq(user.id, zulema.judgeId));
    await db.insert(scores).values([
      { judgeAssignmentId: zulema.judgeAssignmentId, value: "90.0" },
      { judgeAssignmentId: ana.judgeAssignmentId, value: "70.0" },
    ]);
    const disqualified = await addScored(fixture, {
      name: "Descalificada",
      orderNumber: 2,
      values: ["90.0"],
    });
    await disqualify(disqualified.presentationId);
    await publishResults(fixture.event.id);
    const evaluatedSince = await addScored(fixture, {
      name: "Evaluada después",
      orderNumber: 3,
      values: ["88.0"],
    });

    const results = await readPresentationResults(
      { kind: "individual" },
      [scored, disqualified, evaluatedSince].map((p) => p.choreographyId),
    );

    expect(results.get(scored.choreographyId)).toEqual({
      judges: [
        { judgeId: ana.judgeId, judgeName: "Ana Juez", value: "70.0" },
        { judgeId: zulema.judgeId, judgeName: "Zulema Juez", value: "90.0" },
      ],
      result: { average: 80, award: "silver", kind: "scored" },
    });
    expect(results.get(disqualified.choreographyId)).toEqual({
      judges: [],
      result: { kind: "disqualified" },
    });
    expect(results.has(evaluatedSince.choreographyId)).toBe(false);
  });

  test("are gone while the event's stamp is lifted and the presentation keeps its own", async () => {
    const fixture = await seedJudgingFixture();
    const scored = await addScored(fixture, {
      name: "Primera",
      orderNumber: 1,
      values: ["70.0"],
    });
    await publishResults(fixture.event.id);
    await db
      .update(events)
      .set({ resultsPublishedAt: null })
      .where(eq(events.id, fixture.event.id));

    const results = await readPresentationResults({ kind: "individual" }, [
      scored.choreographyId,
    ]);

    expect(results.size).toBe(0);
  });
});
