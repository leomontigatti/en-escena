import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  events,
  presentations,
  scoreCriterionValues,
  scores,
} from "@/db/schema";
import { eq } from "drizzle-orm";

import {
  readJudgeAssignedDays,
  readJudgePresentations,
} from "@/lib/judging/judge-list.server";
import { withdrawChoreographyForTest } from "@/lib/choreographies/withdrawn-choreography.test-support";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { createFeedbackAudioStorage } from "@/lib/storage/feedback-audio.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

/** The catalog schedule's own date, which every presentation takes by default. */
const showDay = "2026-05-01";

describe("the judge's list of one day's presentations", () => {
  test("reads only this judge's assignments on the requested day, in order number", async () => {
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

    const rows = await readJudgePresentations({
      judgeId,
      scheduledDate: showDay,
    });

    expect(rows.map((row) => row.name)).toEqual(["Primera", "Segunda"]);
    expect(rows.map((row) => row.orderNumber)).toEqual([1, 2]);
    await expect(
      readJudgePresentations({ judgeId, scheduledDate: "2026-05-02" }),
    ).resolves.toMatchObject([{ name: "Mañana" }]);
  });

  test("keeps a withdrawn presentation at its number, marked withdrawn", async () => {
    const fixture = await seedJudgingFixture();
    const performing = await fixture.addPresentation({
      name: "En escena",
      orderNumber: 1,
    });
    const withdrawn = await fixture.addPresentation({
      name: "Retirada",
      orderNumber: 2,
    });
    const { judgeId } = await fixture.assignJudge(performing.presentationId);
    await fixture.assignJudge(withdrawn.presentationId, judgeId);
    await withdrawChoreographyForTest(withdrawn.choreographyId);

    const rows = await readJudgePresentations({
      judgeId,
      scheduledDate: showDay,
    });

    expect(rows.map((row) => [row.orderNumber, row.withdrawn])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  test("describes the row, academy included, without another judge's work", async () => {
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

    const [row] = await readJudgePresentations({
      scheduledDate: showDay,
      judgeId,
    });

    expect(row).toMatchObject({
      academyName: fixture.academy.academy.name,
      categoryName: fixture.catalog.categoryWithLevel.name,
      experienceLevel: "amateur",
      experienceLevelRequirement: "required",
      groupType: "solo",
      modalityName: fixture.catalog.modality.name,
      presentationId: presentation.presentationId,
      status: "pending",
      submodalityName: fixture.catalog.submodality.name,
    });
    expect(JSON.stringify(row)).not.toContain("90.0");
  });

  test("tells the judge the academy asked for a professional evaluation", async () => {
    const fixture = await seedJudgingFixture();
    const asked = await fixture.addPresentation({
      name: "Exigente",
      orderNumber: 1,
      professionalEvaluation: true,
    });
    const regular = await fixture.addPresentation({
      name: "Regular",
      orderNumber: 2,
    });
    const { judgeId } = await fixture.assignJudge(asked.presentationId);
    await fixture.assignJudge(regular.presentationId, judgeId);

    await expect(
      readJudgePresentations({ scheduledDate: showDay, judgeId }),
    ).resolves.toMatchObject([
      { name: "Exigente", professionalEvaluation: true },
      { name: "Regular", professionalEvaluation: false },
    ]);
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

    const [row] = await readJudgePresentations({
      scheduledDate: showDay,
      judgeId,
    });

    expect(row).toMatchObject({
      experienceLevel: null,
      experienceLevelRequirement: "notApplicable",
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
      scheduledDate: showDay,
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

  describe("the sheet each row is scored on", () => {
    /** General criteria that reach 100, and the catalog level's own. */
    async function seedSheets() {
      const fixture = await seedJudgingFixture();

      await fixture.addCriterion({
        maximum: 100,
        name: "Técnica",
        position: 0,
      });
      await fixture.addCriterion({
        experienceLevel: fixture.catalog.level.id,
        maximum: 20,
        name: "Figuras",
        position: 0,
      });

      return fixture;
    }

    async function readOnlyRow(
      fixture: Awaited<ReturnType<typeof seedSheets>>,
      presentation: Parameters<typeof fixture.addPresentation>[0],
    ) {
      const added = await fixture.addPresentation(presentation);
      const { judgeId } = await fixture.assignJudge(added.presentationId);
      const [row] = await readJudgePresentations({
        judgeId,
        scheduledDate: showDay,
      });

      return row;
    }

    test("is a single value for a `Sin nivel` grupal, general criteria or not", async () => {
      const fixture = await seedSheets();

      const row = await readOnlyRow(fixture, {
        experienceLevelId: null,
        groupType: "grupal",
        name: "Grupal sin nivel",
        orderNumber: 1,
      });

      expect(row.criteria).toEqual([]);
      expect(row.experienceLevelRequirement).toBe("optional");
    });

    test("is its level's `Planilla` for a grupal that declared one", async () => {
      const fixture = await seedSheets();

      const row = await readOnlyRow(fixture, {
        groupType: "grupal",
        name: "Grupal con nivel",
        orderNumber: 1,
      });

      expect(row.criteria.map((criterion) => criterion.name)).toEqual([
        "Técnica",
        "Figuras",
      ]);
    });

    test("is the general criteria alone for `No aplica` and for a blank required level", async () => {
      const fixture = await seedSheets();
      const notApplicable = await fixture.addPresentation({
        categoryId: fixture.catalog.categoryWithoutLevel.id,
        experienceLevelId: null,
        groupType: "grupal",
        name: "No aplica",
        orderNumber: 1,
      });
      const unassigned = await fixture.addPresentation({
        experienceLevelId: null,
        groupType: "trio",
        name: "Sin asignar",
        orderNumber: 2,
      });
      const { judgeId } = await fixture.assignJudge(
        notApplicable.presentationId,
      );
      await fixture.assignJudge(unassigned.presentationId, judgeId);

      const rows = await readJudgePresentations({
        judgeId,
        scheduledDate: showDay,
      });

      expect(
        rows.map((row) => row.criteria.map((criterion) => criterion.name)),
      ).toEqual([["Técnica"], ["Técnica"]]);
    });
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
      scheduledDate: showDay,
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

    const [row] = await readJudgePresentations({
      judgeId,
      scheduledDate: showDay,
    });

    expect(row.value).toBeNull();
    expect(row.criteriaValues).toEqual({});
  });

  test("is empty on a day the judge has nothing assigned", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const { judgeId } = await fixture.assignJudge(presentation.presentationId);

    await expect(
      readJudgePresentations({ judgeId, scheduledDate: "2026-05-02" }),
    ).resolves.toEqual([]);
  });
});

describe("the list of a day of an event that is not the active one", () => {
  test("reads nothing, even for a day the judge was assigned", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const { judgeId } = await fixture.assignJudge(presentation.presentationId);

    await db
      .update(events)
      .set({ active: false })
      .where(eq(events.id, fixture.event.id));

    await expect(
      readJudgePresentations({ judgeId, scheduledDate: showDay }),
    ).resolves.toEqual([]);
  });
});

describe("the days a judge has presentations on", () => {
  test("lists each of this judge's days once, in date order", async () => {
    const fixture = await seedJudgingFixture();
    const later = await fixture.addPresentation({
      name: "Después",
      orderNumber: 3,
      scheduledDate: "2026-05-03",
    });
    const first = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const second = await fixture.addPresentation({
      name: "Segunda",
      orderNumber: 2,
    });
    const somebodyElses = await fixture.addPresentation({
      name: "De otro jurado",
      orderNumber: 4,
      scheduledDate: "2026-05-02",
    });

    const { judgeId } = await fixture.assignJudge(later.presentationId);
    await fixture.assignJudge(first.presentationId, judgeId);
    await fixture.assignJudge(second.presentationId, judgeId);
    await fixture.assignJudge(somebodyElses.presentationId);

    await expect(readJudgeAssignedDays({ judgeId })).resolves.toEqual([
      showDay,
      "2026-05-03",
    ]);
  });

  test("leaves out the days of an event that is not the active one", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });
    const { judgeId } = await fixture.assignJudge(presentation.presentationId);

    await db
      .update(events)
      .set({ active: true })
      .where(eq(events.id, fixture.event.id));

    await expect(readJudgeAssignedDays({ judgeId })).resolves.toEqual([
      showDay,
    ]);

    await db
      .update(events)
      .set({ active: false })
      .where(eq(events.id, fixture.event.id));

    await expect(readJudgeAssignedDays({ judgeId })).resolves.toEqual([]);
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
      scheduledDate: showDay,
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
      scheduledDate: showDay,
      storage,
    });

    expect(row.feedbackAudioUrl).toBeNull();
  });
});
