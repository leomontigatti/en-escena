import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { scores, user } from "@/db/schema";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { createSignedInRequest } from "@/lib/test-support/auth";

import {
  handlePresentationListAction,
  loadPresentationListRouteData,
} from "./server";
import {
  editJudgesIntent,
  judgeToAddFieldName,
  judgeToRemoveFieldName,
  presentationChoreographyIdFieldName,
} from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const listUrl = "http://localhost/administracion/presentaciones";

async function editThroughTheAction(input: {
  choreographyIds: string[];
  email: string;
  judgeIdsToAdd?: string[];
  judgeIdsToRemove?: string[];
}) {
  const body = new FormData();
  body.set("intent", editJudgesIntent);

  for (const choreographyId of input.choreographyIds) {
    body.append(presentationChoreographyIdFieldName, choreographyId);
  }

  for (const judgeId of input.judgeIdsToAdd ?? []) {
    body.append(judgeToAddFieldName, judgeId);
  }

  for (const judgeId of input.judgeIdsToRemove ?? []) {
    body.append(judgeToRemoveFieldName, judgeId);
  }

  const { request } = await createSignedInRequest({
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

    const result = await editThroughTheAction({
      choreographyIds: [scored.choreographyId],
      email: "admin.quita.puntuada@example.com",
      judgeIdsToRemove: [judgeId],
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

    const result = await editThroughTheAction({
      choreographyIds: [scored.choreographyId, unscored.choreographyId],
      email: "admin.quita.mixta@example.com",
      judgeIdsToRemove: [judgeId, other.judgeId],
    });

    expect(result).toEqual({
      message:
        "Se quitó 1 juez de 1 presentación. Se mantuvo 1 asignación que ya tiene puntaje.",
      status: "success",
    });
  });
});

describe("editing judges from the participation list", () => {
  // One submission swaps a judge for another on every chosen row, and says
  // both halves.
  test("adds one judge and removes another in the same edit", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Una",
      orderNumber: 1,
    });
    const leaving = await fixture.assignJudge(presentation.presentationId);
    const [{ id: arriving }] = await db
      .insert(user)
      .values({
        email: "juez.llega@example.com",
        name: "Bruno Juez",
        role: "judge",
      })
      .returning();

    const result = await editThroughTheAction({
      choreographyIds: [presentation.choreographyId],
      email: "admin.cambia.jueces@example.com",
      judgeIdsToAdd: [arriving],
      judgeIdsToRemove: [leaving.judgeId],
    });

    expect(result).toEqual({
      message:
        "Se asignó 1 juez a 1 presentación. Se quitó 1 juez de 1 presentación.",
      status: "success",
    });

    const { request } = await createSignedInRequest({
      email: "admin.lee.jueces@example.com",
      requestUrl: listUrl,
      role: "admin",
    });
    const list = await loadPresentationListRouteData(request);

    expect(
      list.presentations.find((row) => row.id === presentation.choreographyId)
        ?.assignedJudgeIds,
    ).toEqual([arriving]);
  });

  test("refuses an edit that changes no judge", async () => {
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Una",
      orderNumber: 1,
    });

    const result = await editThroughTheAction({
      choreographyIds: [presentation.choreographyId],
      email: "admin.sin.cambios@example.com",
    });

    expect(result).toMatchObject({ init: { status: 400 } });
  });
});

describe("the participation list's missing judges warning", () => {
  test("flags the presentation left out of its schedule's panel", async () => {
    const fixture = await seedJudgingFixture();
    const judged = await fixture.addPresentation({
      name: "Con jurado",
      orderNumber: 1,
    });
    const forgotten = await fixture.addPresentation({
      name: "Olvidada",
      orderNumber: 2,
    });
    await fixture.assignJudge(judged.presentationId);
    const { request } = await createSignedInRequest({
      email: `presentacion.jurado.${crypto.randomUUID()}@example.com`,
      requestUrl: listUrl,
      role: "admin",
    });

    const result = await loadPresentationListRouteData(request);
    const kindsOf = (choreographyId: string) =>
      result.presentations
        .find((row) => row.id === choreographyId)
        ?.warnings.map((warning) => warning.kind);

    expect(kindsOf(forgotten.choreographyId)).toContain("missingJudges");
    expect(kindsOf(judged.choreographyId)).not.toContain("missingJudges");
  });
});
