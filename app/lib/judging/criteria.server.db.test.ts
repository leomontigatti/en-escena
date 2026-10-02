import { asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { categoryModalities, scores, submodalityCriteria } from "@/db/schema";
import {
  findScoreLockedSubmodalityIds,
  isSubmodalityScoreLocked,
  listSubmodalityCriteria,
  readModalitySheets,
  replaceSheetCriteria,
} from "@/lib/judging/criteria.server";
import { addingCriteriaTotalMessage } from "@/lib/judging/criteria";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("submodality criteria", () => {
  test("saves the criteria of a submodality as a whole, in the submitted order", async () => {
    const fixture = await seedJudgingFixture();
    const submodalityId = fixture.catalog.submodality.id;

    await expect(
      replaceSheetCriteria(submodalityId, {
        experienceLevel: null,
        criteria: [
          { kind: "adds", maximum: "60", name: " técnica " },
          { kind: "adds", maximum: "40", name: "Interpretación" },
          { kind: "deducts", maximum: "10", name: "Caídas" },
        ],
      }),
    ).resolves.toMatchObject({ ok: true });

    const saved = await listSubmodalityCriteria(fixture.event.id);
    expect(
      saved.map((criterion) => ({
        kind: criterion.kind,
        maximum: criterion.maximum,
        name: criterion.name,
        position: criterion.position,
      })),
    ).toEqual([
      { kind: "adds", maximum: 60, name: "Técnica", position: 0 },
      { kind: "adds", maximum: 40, name: "Interpretación", position: 1 },
      { kind: "deducts", maximum: 10, name: "Caídas", position: 2 },
    ]);
  });

  test("replaces the previous set instead of adding to it", async () => {
    const fixture = await seedJudgingFixture();
    const submodalityId = fixture.catalog.submodality.id;
    await fixture.addCriterion({ maximum: 100, name: "Todo" });

    await replaceSheetCriteria(submodalityId, {
      experienceLevel: null,
      criteria: [{ kind: "adds", maximum: "100", name: "Otra cosa" }],
    });

    const saved = await listSubmodalityCriteria(fixture.event.id);
    expect(saved.map((criterion) => criterion.name)).toEqual(["Otra Cosa"]);
  });

  test("reads the sheets a modality's categories score on", async () => {
    const fixture = await seedJudgingFixture();

    const sheets = await readModalitySheets(fixture.event.id);

    expect(sheets.get(fixture.catalog.modality.id)).toEqual({
      generalStandsAlone: true,
      levels: ["amateur"],
    });
  });

  test("saves a level's own criteria, leaving the general ones and other levels alone", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addCriterion({ maximum: 60, name: "Técnica" });
    await fixture.addCriterion({
      experienceLevel: "profesional",
      maximum: 40,
      name: "Dificultad",
    });

    await expect(
      replaceSheetCriteria(fixture.catalog.submodality.id, {
        criteria: [
          { kind: "adds", maximum: "25", name: "Figuras" },
          { kind: "adds", maximum: "15", name: "Coreografía" },
          { kind: "deducts", maximum: "5", name: "Tiempo excedido" },
        ],
        experienceLevel: "amateur",
      }),
    ).resolves.toEqual({ ok: true });

    await expect(
      readSheetNames(fixture.catalog.submodality.id),
    ).resolves.toEqual([
      "amateur Figuras",
      "amateur Coreografía",
      "amateur Tiempo Excedido",
      "profesional Dificultad",
      "null Técnica",
    ]);
  });

  test("refuses a level sheet that does not complete the general criteria to 100", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addCriterion({ maximum: 60, name: "Técnica" });

    await expect(
      replaceSheetCriteria(fixture.catalog.submodality.id, {
        criteria: [{ kind: "adds", maximum: "30", name: "Figuras" }],
        experienceLevel: "amateur",
      }),
    ).resolves.toMatchObject({
      fieldErrors: { criteria: addingCriteriaTotalMessage },
      ok: false,
    });
    await expect(
      readSheetNames(fixture.catalog.submodality.id),
    ).resolves.toEqual(["null Técnica"]);
  });

  test("lets the general criteria leave a level short when every category has levels", async () => {
    const fixture = await seedJudgingFixture();
    await db
      .delete(categoryModalities)
      .where(
        eq(
          categoryModalities.categoryId,
          fixture.catalog.categoryWithoutLevel.id,
        ),
      );

    await expect(
      replaceSheetCriteria(fixture.catalog.submodality.id, {
        criteria: [{ kind: "adds", maximum: "60", name: "Técnica" }],
        experienceLevel: null,
      }),
    ).resolves.toEqual({ ok: true });
  });

  test("reads no sheet for a modality no category offers yet, so the general criteria may be short", async () => {
    const fixture = await seedJudgingFixture();
    await db
      .delete(categoryModalities)
      .where(eq(categoryModalities.modalityId, fixture.catalog.modality.id));

    await expect(readModalitySheets(fixture.event.id)).resolves.toEqual(
      new Map([
        [
          fixture.catalog.modality.id,
          { generalStandsAlone: false, levels: [] },
        ],
      ]),
    );
    await expect(
      replaceSheetCriteria(fixture.catalog.submodality.id, {
        criteria: [{ kind: "adds", maximum: "60", name: "Técnica" }],
        experienceLevel: null,
      }),
    ).resolves.toEqual({ ok: true });
  });

  test("clears the criteria when the submitted list is empty", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addCriterion({ maximum: 100, name: "Todo" });

    await expect(
      replaceSheetCriteria(fixture.catalog.submodality.id, {
        experienceLevel: null,
        criteria: [],
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(listSubmodalityCriteria(fixture.event.id)).resolves.toEqual(
      [],
    );
  });

  test("refuses adding maxima that do not total 100 without touching the stored set", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addCriterion({ maximum: 100, name: "Todo" });

    await expect(
      replaceSheetCriteria(fixture.catalog.submodality.id, {
        experienceLevel: null,
        criteria: [{ kind: "adds", maximum: "90", name: "Casi" }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: {
        criteria: "El total de los criterios que suman debe ser igual a 100.",
      },
    });

    const saved = await listSubmodalityCriteria(fixture.event.id);
    expect(saved.map((criterion) => criterion.name)).toEqual(["Todo"]);
  });

  test("refuses two criteria with the same name", async () => {
    const fixture = await seedJudgingFixture();

    await expect(
      replaceSheetCriteria(fixture.catalog.submodality.id, {
        experienceLevel: null,
        criteria: [
          { kind: "adds", maximum: "50", name: "Técnica" },
          { kind: "adds", maximum: "50", name: " técnica " },
        ],
      }),
    ).resolves.toMatchObject({ ok: false, code: "duplicate-name" });
  });

  test("refuses a criterion with no name", async () => {
    const fixture = await seedJudgingFixture();

    await expect(
      replaceSheetCriteria(fixture.catalog.submodality.id, {
        experienceLevel: null,
        criteria: [{ kind: "adds", maximum: "100", name: "  " }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { "criteria.0.name": expect.any(String) },
    });
  });

  test("locks a submodality once one of its presentations has a score", async () => {
    const fixture = await seedJudgingFixture();
    const submodalityId = fixture.catalog.submodality.id;

    await expect(isSubmodalityScoreLocked(submodalityId)).resolves.toBe(false);

    const presentation = await fixture.addPresentation({
      name: "Una",
      orderNumber: 1,
    });
    const { judgeAssignmentId } = await fixture.assignJudge(
      presentation.presentationId,
    );

    await expect(isSubmodalityScoreLocked(submodalityId)).resolves.toBe(false);

    await db.insert(scores).values({ judgeAssignmentId, value: "90" });

    await expect(isSubmodalityScoreLocked(submodalityId)).resolves.toBe(true);
    await expect(
      findScoreLockedSubmodalityIds(fixture.event.id),
    ).resolves.toEqual(new Set([submodalityId]));
  });

  test("refuses the save of a locked submodality's criteria", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Una",
      orderNumber: 1,
    });
    const { judgeAssignmentId } = await fixture.assignJudge(
      presentation.presentationId,
    );
    await db.insert(scores).values({ judgeAssignmentId, value: "90" });

    await expect(
      replaceSheetCriteria(fixture.catalog.submodality.id, {
        experienceLevel: null,
        criteria: [{ kind: "adds", maximum: "100", name: "Técnica" }],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se pueden cambiar los criterios porque la submodalidad ya tiene puntajes.",
    });
    await expect(listSubmodalityCriteria(fixture.event.id)).resolves.toEqual(
      [],
    );
  });

  test("reports a submodality outside the event", async () => {
    await expect(
      replaceSheetCriteria("submodality_missing", {
        criteria: [],
        experienceLevel: null,
      }),
    ).resolves.toMatchObject({ ok: false, code: "event-bases-not-found" });
  });
});

/** Each level's criteria in the enum's order, and the general ones last. */
async function readSheetNames(submodalityId: string) {
  const rows = await db.query.submodalityCriteria.findMany({
    orderBy: [
      asc(submodalityCriteria.experienceLevel),
      asc(submodalityCriteria.position),
    ],
    where: eq(submodalityCriteria.submodalityId, submodalityId),
  });

  return rows.map((row) => `${row.experienceLevel} ${row.name}`);
}
