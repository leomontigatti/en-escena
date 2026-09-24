import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { presentations, scoreCriterionValues, scores } from "@/db/schema";
import { eq } from "drizzle-orm";

import { readJudgePresentations } from "@/lib/judging/judge-list.server";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { createFeedbackAudioStorage } from "@/lib/storage/feedback-audio.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

/** Business time is UTC-3 all year, so a business instant is the UTC one plus three hours. */
function businessInstant(text: string) {
  return new Date(`${text}-03:00`);
}

const showNight = businessInstant("2026-05-01T21:00:00");

describe("the judge's list of today's presentations", () => {
  test("reads only this judge's assignments for today, in order number", async () => {
    const fixture = await seedJudgingFixture();
    const second = await fixture.addPresentation({
      name: "Segunda",
      orderNumber: 2,
    });
    const first = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const tomorrow = await fixture.addPresentation({
      name: "Mañana",
      orderNumber: 3,
      scheduledDate: "2026-05-02",
    });
    const somebodyElses = await fixture.addPresentation({
      name: "De otro jurado",
      orderNumber: 4,
    });

    const { judgeId } = await fixture.assignJudge(second.presentationId);
    await fixture.assignJudge(first.presentationId, judgeId);
    await fixture.assignJudge(tomorrow.presentationId, judgeId);
    await fixture.assignJudge(somebodyElses.presentationId);

    const rows = await readJudgePresentations({ now: showNight, judgeId });

    expect(rows.map((row) => row.name)).toEqual(["Primera", "Segunda"]);
    expect(rows.map((row) => row.orderNumber)).toEqual([1, 2]);
  });

  test("describes the row without naming the academy or another judge's work", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const { judgeId } = await fixture.assignJudge(presentation.presentationId);
    const other = await fixture.assignJudge(presentation.presentationId);

    await db.insert(scores).values({
      judgeAssignmentId: other.judgeAssignmentId,
      value: "90.0",
    });

    const [row] = await readJudgePresentations({ now: showNight, judgeId });

    expect(row).toMatchObject({
      categoryAdmitsExperienceLevels: true,
      categoryName: fixture.catalog.categoryWithLevel.name,
      experienceLevel: "amateur",
      groupType: "solo",
      modalityName: fixture.catalog.modality.name,
      presentationId: presentation.presentationId,
      status: "pending",
      submodalityName: fixture.catalog.submodality.name,
    });
    expect(JSON.stringify(row)).not.toContain(fixture.academy.academy.name);
    expect(JSON.stringify(row)).not.toContain("90.0");
  });

  test("reads a category without levels as admitting none", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      categoryId: fixture.catalog.categoryWithoutLevel.id,
      experienceLevelId: null,
      name: "Sin nivel",
      orderNumber: 1,
    });
    const { judgeId } = await fixture.assignJudge(presentation.presentationId);

    const [row] = await readJudgePresentations({ now: showNight, judgeId });

    expect(row).toMatchObject({
      categoryAdmitsExperienceLevels: false,
      experienceLevel: null,
    });
  });

  test("carries the judge's own status and the submodality's criteria", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addCriterion({ maximum: 60, name: "Técnica", position: 0 });
    await fixture.addCriterion({
      kind: "deducts",
      maximum: 10,
      name: "Caídas",
      position: 1,
    });

    const scored = await fixture.addPresentation({
      name: "Puntuada",
      orderNumber: 1,
    });
    const disqualified = await fixture.addPresentation({
      name: "Descalificada",
      orderNumber: 2,
    });
    const assignment = await fixture.assignJudge(scored.presentationId);
    await fixture.assignJudge(disqualified.presentationId, assignment.judgeId);

    await db.insert(scores).values({
      judgeAssignmentId: assignment.judgeAssignmentId,
      value: "80.5",
    });
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date() })
      .where(eq(presentations.id, disqualified.presentationId));

    const rows = await readJudgePresentations({
      now: showNight,
      judgeId: assignment.judgeId,
    });

    expect(rows.map((row) => row.status)).toEqual([
      "noFeedback",
      "disqualified",
    ]);
    expect(rows[0].criteria).toMatchObject([
      { kind: "adds", maximum: 60, name: "Técnica" },
      { kind: "deducts", maximum: 10, name: "Caídas" },
    ]);
  });

  test("carries the judge's own score and sheet, and nobody else's", async () => {
    const fixture = await seedJudgingFixture();
    const technique = await fixture.addCriterion({
      maximum: 60,
      name: "Técnica",
      position: 0,
    });
    const falls = await fixture.addCriterion({
      kind: "deducts",
      maximum: 10,
      name: "Caídas",
      position: 1,
    });
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const judge = await fixture.assignJudge(presentation.presentationId);
    const colleague = await fixture.assignJudge(presentation.presentationId);

    const [own] = await db
      .insert(scores)
      .values({ judgeAssignmentId: judge.judgeAssignmentId, value: "55.5" })
      .returning();
    const [theirs] = await db
      .insert(scores)
      .values({ judgeAssignmentId: colleague.judgeAssignmentId, value: "12.0" })
      .returning();

    await db.insert(scoreCriterionValues).values([
      { criterionId: technique.id, scoreId: own.id, value: "58.0" },
      { criterionId: falls.id, scoreId: own.id, value: "2.5" },
      { criterionId: technique.id, scoreId: theirs.id, value: "12.0" },
    ]);

    const [row] = await readJudgePresentations({
      judgeId: judge.judgeId,
      now: showNight,
    });

    expect(row.value).toBe("55.5");
    expect(row.criteriaValues).toEqual({
      [falls.id]: "2.5",
      [technique.id]: "58.0",
    });
    expect(JSON.stringify(row)).not.toContain("12.0");
  });

  test("carries no score for a presentation the judge has not saved", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const { judgeId } = await fixture.assignJudge(presentation.presentationId);

    const [row] = await readJudgePresentations({ judgeId, now: showNight });

    expect(row.value).toBeNull();
    expect(row.criteriaValues).toEqual({});
  });

  test("is empty once the judging day has closed", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const { judgeId } = await fixture.assignJudge(presentation.presentationId);

    await expect(
      readJudgePresentations({
        now: businessInstant("2026-05-02T03:00:00"),
        judgeId,
      }),
    ).resolves.toEqual([]);
  });
});

describe("the judge's own `Devolución`", () => {
  test("signs the stored take so the judge can listen to it again", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const judge = await fixture.assignJudge(presentation.presentationId);

    await db.insert(scores).values({
      feedbackAudioStorageKey: "takes/a.webm",
      judgeAssignmentId: judge.judgeAssignmentId,
      value: "80.0",
    });

    const [row] = await readJudgePresentations({
      judgeId: judge.judgeId,
      now: showNight,
      storage: createFeedbackAudioStorage({
        createSignedUrl: async (input) => `https://example.test/${input.key}`,
        remove: async () => {},
        upload: async () => {},
      }),
    });

    expect(row.feedbackAudioUrl).toBe("https://example.test/takes/a.webm");
  });

  test("reads no take as no url, without signing anything", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const judge = await fixture.assignJudge(presentation.presentationId);
    const storage = createFeedbackAudioStorage({
      createSignedUrl: async () => {
        throw new Error("nothing to sign");
      },
      remove: async () => {},
      upload: async () => {},
    });

    const [row] = await readJudgePresentations({
      judgeId: judge.judgeId,
      now: showNight,
      storage,
    });

    expect(row.feedbackAudioUrl).toBeNull();
  });
});
