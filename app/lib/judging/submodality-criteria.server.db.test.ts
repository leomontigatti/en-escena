import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import {
  readCriteriaBySubmodality,
  readPresentationCriteria,
  readSubmodalityCriteria,
  type SheetSubject,
  sheetForChoreography,
} from "@/lib/judging/submodality-criteria.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

/**
 * A submodality with general criteria and the criteria of two levels, entered
 * out of sheet order so the order the readers return is their own.
 */
async function seedLevelSheets() {
  const fixture = await seedJudgingFixture();

  await fixture.addCriterion({
    experienceLevel: "amateur",
    maximum: 40,
    name: "Figuras",
    position: 0,
  });
  await fixture.addCriterion({ maximum: 60, name: "Técnica", position: 0 });
  await fixture.addCriterion({
    experienceLevel: "profesional",
    maximum: 40,
    name: "Dificultad",
    position: 0,
  });
  await fixture.addCriterion({
    kind: "deducts",
    maximum: 5,
    name: "Caídas",
    position: 1,
  });

  return fixture;
}

/** A solo in a category offering both levels the sheets are written for. */
function soloIn(
  fixture: Awaited<ReturnType<typeof seedLevelSheets>>,
): Omit<SheetSubject, "experienceLevel"> {
  return {
    categoryExperienceLevels: ["amateur", "profesional"],
    groupType: "solo",
    submodalityId: fixture.catalog.submodality.id,
  };
}

describe("a presentation's sheet", () => {
  test("is the general criteria, then those of its own level", async () => {
    const fixture = await seedLevelSheets();
    const presentation = await fixture.addPresentation({
      experienceLevelId: "amateur",
      name: "Primera",
      orderNumber: 1,
    });

    const sheet = await readPresentationCriteria(
      db,
      presentation.presentationId,
    );

    expect(sheet.map((criterion) => criterion.name)).toEqual([
      "Técnica",
      "Caídas",
      "Figuras",
    ]);
    expect(sheet[2]).toMatchObject({ experienceLevel: "amateur" });
  });

  test("is the general criteria alone for a choreography with no level", async () => {
    const fixture = await seedLevelSheets();
    const presentation = await fixture.addPresentation({
      experienceLevelId: null,
      name: "Sin nivel",
      orderNumber: 1,
    });

    const sheet = await readPresentationCriteria(
      db,
      presentation.presentationId,
    );

    expect(sheet.map((criterion) => criterion.name)).toEqual([
      "Técnica",
      "Caídas",
    ]);
  });

  test("reads the same from the submodality and level", async () => {
    const fixture = await seedLevelSheets();

    const sheet = await readSubmodalityCriteria(db, {
      ...soloIn(fixture),
      experienceLevel: "profesional",
    });

    expect(sheet.map((criterion) => criterion.name)).toEqual([
      "Técnica",
      "Caídas",
      "Dificultad",
    ]);
  });

  test("is cut per level from a list's read of every submodality", async () => {
    const fixture = await seedLevelSheets();

    const bySubmodality = await readCriteriaBySubmodality(db, [
      fixture.catalog.submodality.id,
    ]);
    const criteria = bySubmodality.get(fixture.catalog.submodality.id) ?? [];

    const names = (subject: SheetSubject) =>
      sheetForChoreography(criteria, subject).map(
        (criterion) => criterion.name,
      );

    expect(
      names({ ...soloIn(fixture), experienceLevel: "profesional" }),
    ).toEqual(["Técnica", "Caídas", "Dificultad"]);
    expect(names({ ...soloIn(fixture), experienceLevel: null })).toEqual([
      "Técnica",
      "Caídas",
    ]);
    expect(
      names({ ...soloIn(fixture), experienceLevel: null, groupType: "grupal" }),
    ).toEqual([]);
  });

  test("is none for a `Sin nivel` grupal, which scores a single value", async () => {
    const fixture = await seedLevelSheets();
    const presentation = await fixture.addPresentation({
      experienceLevelId: null,
      groupType: "grupal",
      name: "Grupal sin nivel",
      orderNumber: 1,
    });

    await expect(
      readPresentationCriteria(db, presentation.presentationId),
    ).resolves.toEqual([]);
  });
});
