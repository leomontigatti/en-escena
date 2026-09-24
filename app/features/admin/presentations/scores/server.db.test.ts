import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { scores } from "@/db/schema";
import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";

import {
  handlePresentationScoresAction,
  loadPresentationScoresRouteData,
} from "./server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

function scoresUrl(presentationId: string) {
  return `http://localhost/administracion/presentacion/${presentationId}/puntajes`;
}

async function seedScoredPresentation() {
  const fixture = await seedJudgingFixture();
  const presentation = await fixture.addPresentation({
    name: "Primera",
    orderNumber: 1,
  });
  const judge = await fixture.assignJudge(presentation.presentationId);

  await db
    .insert(scores)
    .values({ judgeAssignmentId: judge.judgeAssignmentId, value: "90.0" });

  return presentation;
}

describe("the presentation's scores route", () => {
  test("lets an administrator read the panel and gives them the edits", async () => {
    const presentation = await seedScoredPresentation();
    const { request } = await createSignedInRequest({
      email: "admin.puntajes@example.com",
      requestUrl: scoresUrl(presentation.presentationId),
      role: "admin",
    });

    await expect(
      loadPresentationScoresRouteData({
        params: { presentationId: presentation.presentationId },
        request,
      }),
    ).resolves.toMatchObject({
      canEdit: true,
      presentation: { average: 90, medal: "oro", name: "Primera" },
    });
  });

  test("lets an auditor read it and withholds the edits", async () => {
    const presentation = await seedScoredPresentation();
    const { request } = await createSignedInRequest({
      email: "auditor.puntajes@example.com",
      requestUrl: scoresUrl(presentation.presentationId),
      role: "auditor",
    });

    await expect(
      loadPresentationScoresRouteData({
        params: { presentationId: presentation.presentationId },
        request,
      }),
    ).resolves.toMatchObject({ canEdit: false });
  });

  test("turns an academy away from the panel", async () => {
    const presentation = await seedScoredPresentation();
    const { request } = await createSignedInRequest({
      email: "academia.puntajes@example.com",
      requestUrl: scoresUrl(presentation.presentationId),
      role: "academy",
    });

    await expectThrownResponse(
      loadPresentationScoresRouteData({
        params: { presentationId: presentation.presentationId },
        request,
      }),
      403,
    );
  });

  test("answers 404 for a presentation that does not exist", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.inexistente@example.com",
      requestUrl: scoresUrl("00000000-0000-0000-0000-000000000000"),
      role: "admin",
    });

    await expectThrownResponse(
      loadPresentationScoresRouteData({
        params: { presentationId: "00000000-0000-0000-0000-000000000000" },
        request,
      }),
      404,
    );
  });

  test("refuses an auditor's write", async () => {
    const presentation = await seedScoredPresentation();
    const body = new FormData();

    body.set("intent", "edit-score");

    const { request } = await createSignedInRequest({
      body,
      email: "auditor.escribe@example.com",
      requestUrl: scoresUrl(presentation.presentationId),
      role: "auditor",
    });

    await expectThrownResponse(
      handlePresentationScoresAction({
        params: { presentationId: presentation.presentationId },
        request,
      }),
      403,
    );
  });
});
