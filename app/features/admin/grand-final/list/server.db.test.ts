import { describe, expect, test } from "vitest";

import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { setAcademyFinalistPicks } from "@/lib/grand-final/finalist-pick.server";
import { seedEligibilityFixture } from "@/lib/grand-final/grand-final.test-support";

import {
  handleGrandFinalListAction,
  loadGrandFinalListRouteData,
} from "./server";

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
  test("lists each eligible academy in its modality, with the judges who picked it", async () => {
    const { jazz, judgeId, pirueta } = await seedJazz();
    await setAcademyFinalistPicks({
      academyId: pirueta,
      picks: [{ judgeIds: [judgeId], modalityId: jazz }],
    });

    const { picks } = await loadTheList();

    expect(picks?.modalities[0].academies).toEqual([
      expect.objectContaining({
        academyId: pirueta,
        finalist: true,
        pickedByJudgeIds: [judgeId],
      }),
    ]);
  });

  test("turns the auditor away from the list and from its writes", async () => {
    await seedJazz();

    await expectThrownResponse(loadTheList("auditor"), 403);
    await expectThrownResponse(
      submit({ intent: "open-voting-round" }, "auditor"),
      403,
    );
  });

  test("refuses an intent it does not know, the old change of a pick among them", async () => {
    const { jazz, judgeId, pirueta } = await seedJazz();

    await expectThrownResponse(
      submit({
        academyId: pirueta,
        intent: "set-finalist-pick",
        judgeId,
        modalityId: jazz,
      }),
      400,
    );
  });
});
