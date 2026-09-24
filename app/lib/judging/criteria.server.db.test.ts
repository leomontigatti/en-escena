import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { scores } from "@/db/schema";
import {
  findScoreLockedSubmodalityIds,
  isSubmodalityScoreLocked,
  listSubmodalityCriteria,
  replaceSubmodalityCriteria,
} from "@/lib/judging/criteria.server";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("submodality criteria", () => {
  test("saves the criteria of a submodality as a whole, in the submitted order", async () => {
    const fixture = await seedJudgingFixture();
    const submodalityId = fixture.catalog.submodality.id;

    await expect(
      replaceSubmodalityCriteria(submodalityId, {
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

    await replaceSubmodalityCriteria(submodalityId, {
      criteria: [{ kind: "adds", maximum: "100", name: "Otra cosa" }],
    });

    const saved = await listSubmodalityCriteria(fixture.event.id);
    expect(saved.map((criterion) => criterion.name)).toEqual(["Otra Cosa"]);
  });

  test("clears the criteria when the submitted list is empty", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addCriterion({ maximum: 100, name: "Todo" });

    await expect(
      replaceSubmodalityCriteria(fixture.catalog.submodality.id, {
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
      replaceSubmodalityCriteria(fixture.catalog.submodality.id, {
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
      replaceSubmodalityCriteria(fixture.catalog.submodality.id, {
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
      replaceSubmodalityCriteria(fixture.catalog.submodality.id, {
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
      replaceSubmodalityCriteria(fixture.catalog.submodality.id, {
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
      replaceSubmodalityCriteria("submodality_missing", { criteria: [] }),
    ).resolves.toMatchObject({ ok: false, code: "event-bases-not-found" });
  });
});
