import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { scores } from "@/db/schema";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";

import { handlePresentationListAction } from "./server";
import {
  judgeIdFieldName,
  presentationChoreographyIdFieldName,
  removeJudgesIntent,
} from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const listUrl = "http://localhost/administracion/presentacion";

async function removeThroughTheAction(input: {
  choreographyIds: string[];
  email: string;
  judgeIds: string[];
}) {
  const body = new FormData();
  body.set("intent", removeJudgesIntent);

  for (const choreographyId of input.choreographyIds) {
    body.append(presentationChoreographyIdFieldName, choreographyId);
  }

  for (const judgeId of input.judgeIds) {
    body.append(judgeIdFieldName, judgeId);
  }

  const { request } = await createSignedInAdminRequest({
    body,
    email: input.email,
    requestUrl: listUrl,
    role: "admin",
  });

  return await handlePresentationListAction(request);
}

describe("removing judges from the participation list", () => {
  test("refuses a judge who has already scored and says why", async () => {
    const fixture = await seedJudgingFixture();
    const scored = await fixture.addPresentation({
      name: "Una",
      orderNumber: 1,
    });
    const { judgeAssignmentId, judgeId } = await fixture.assignJudge(
      scored.presentationId,
    );
    await db.insert(scores).values({ judgeAssignmentId, value: "90" });

    const result = await removeThroughTheAction({
      choreographyIds: [scored.choreographyId],
      email: "admin.quita.puntuada@example.com",
      judgeIds: [judgeId],
    });

    expect(result).toMatchObject({
      data: {
        message: "No se quitó nada: 1 asignación ya tiene puntaje.",
        status: "error",
      },
      init: { status: 409 },
    });
  });

  test("removes the unscored pair and reports the one it kept", async () => {
    const fixture = await seedJudgingFixture();
    const scored = await fixture.addPresentation({
      name: "Una",
      orderNumber: 1,
    });
    const unscored = await fixture.addPresentation({
      name: "Otra",
      orderNumber: 2,
    });
    const { judgeAssignmentId, judgeId } = await fixture.assignJudge(
      scored.presentationId,
    );
    const other = await fixture.assignJudge(unscored.presentationId);
    await db.insert(scores).values({ judgeAssignmentId, value: "90" });

    const result = await removeThroughTheAction({
      choreographyIds: [scored.choreographyId, unscored.choreographyId],
      email: "admin.quita.mixta@example.com",
      judgeIds: [judgeId, other.judgeId],
    });

    expect(result).toEqual({
      message:
        "Se quitó 1 juez de 1 presentación. Se mantuvo 1 asignación que ya tiene puntaje.",
      status: "success",
    });
  });
});
