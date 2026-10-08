import { describe, expect, test } from "vitest";

import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { seedEligibilityFixture } from "@/lib/grand-final/grand-final.test-support";

import {
  handleGrandFinalListAction,
  loadGrandFinalListRouteData,
} from "./server";
import { setFinalistPickIntent } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const listUrl = "http://localhost/administracion/gran-final";

async function seedJazz() {
  const fixture = await seedEligibilityFixture();
  const jazz = await fixture.addModality("Jazz");
  const pirueta = await fixture.addAcademy("Academia Pirueta");
  const halfway = await fixture.addAcademy("Academia Infantil");
  const choreographyId = await fixture.register({
    academy: pirueta,
    modality: jazz,
    category: "Infantil",
  });
  await fixture.register({
    academy: pirueta,
    modality: jazz,
    category: "Mayores",
  });
  await fixture.register({
    academy: halfway,
    modality: jazz,
    category: "Infantil",
  });
  const judgeId = await fixture.addJudge("Ana Juez");
  await fixture.assignJudge(judgeId, choreographyId);

  return { halfway, jazz, judgeId, pirueta };
}

async function submit(
  values: Record<string, string>,
  role: "admin" | "auditor" = "admin",
) {
  const body = new FormData();
  body.set("intent", setFinalistPickIntent);

  for (const [name, value] of Object.entries(values)) {
    body.set(name, value);
  }

  const { request } = await createSignedInRequest({
    body,
    email: `${role}.${crypto.randomUUID()}@example.com`,
    requestUrl: listUrl,
    role,
  });

  return await handleGrandFinalListAction(request);
}

async function loadTheList(role: "admin" | "auditor" = "admin") {
  const { request } = await createSignedInRequest({
    email: `${role}.${crypto.randomUUID()}@example.com`,
    requestUrl: listUrl,
    role,
  });

  return await loadGrandFinalListRouteData(request);
}

describe("the `Gran final` list route", () => {
  test("sets a judge's pick and shows it on the list", async () => {
    const { jazz, judgeId, pirueta } = await seedJazz();

    await expect(
      submit({ academyId: pirueta, judgeId, modalityId: jazz }),
    ).resolves.toEqual({
      message: "Guardaste la elección de finalista.",
      status: "success",
    });

    const { picks } = await loadTheList();

    expect(picks?.modalities[0].academies).toEqual([
      expect.objectContaining({
        academyId: pirueta,
        pickedByJudgeIds: [judgeId],
      }),
    ]);
  });

  test("refuses an academy that is not eligible in the modality, saying so", async () => {
    const { halfway, jazz, judgeId } = await seedJazz();

    await expect(
      submit({ academyId: halfway, judgeId, modalityId: jazz }),
    ).resolves.toMatchObject({
      data: {
        message:
          "Esa academia no cumple los requisitos de la Gran final en esta modalidad. Elegí otra.",
        status: "error",
      },
      init: { status: 409 },
    });
  });

  test("turns the auditor away from the list and from the write", async () => {
    const { jazz, judgeId, pirueta } = await seedJazz();

    await expectThrownResponse(loadTheList("auditor"), 403);
    await expectThrownResponse(
      submit({ academyId: pirueta, judgeId, modalityId: jazz }, "auditor"),
      403,
    );

    const { picks } = await loadTheList();

    expect(picks?.modalities[0].academies[0].pickedByJudgeIds).toEqual([]);
  });

  test("tells the dialog why a pick cannot change while the event has no judge and no eligible academy", async () => {
    await seedEligibilityFixture();

    const { pickChangeBlockReasons } = await loadTheList();

    expect(pickChangeBlockReasons.map((reason) => reason.code)).toEqual([
      "no-event-judge",
      "no-eligible-academy",
    ]);
  });

  test("leaves the change open with a judge of the event and an eligible academy", async () => {
    await seedJazz();

    await expect(loadTheList()).resolves.toMatchObject({
      pickChangeBlockReasons: [],
    });
  });
});
