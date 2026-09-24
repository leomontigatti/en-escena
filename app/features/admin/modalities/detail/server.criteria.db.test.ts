import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { scores } from "@/db/schema";
import { updateAdministrativeEventModality } from "@/features/admin/modalities/detail/server";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import { listSubmodalityCriteria } from "@/lib/judging/criteria.server";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { expectThrownResponse } from "@/lib/test-support/http";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe("the modality action's criteria intent", () => {
  test("saves the submitted criteria and redirects with the saved toast", async () => {
    const fixture = await seedJudgingFixture();

    const response = await expectThrownResponse(
      submitCriteria(fixture, [
        { kind: "adds", maximum: "60", name: "Técnica" },
        { kind: "adds", maximum: "40", name: "Interpretación" },
      ]),
      302,
    );

    expect(response.headers.get("set-cookie")).toContain("flash");
    const saved = await listSubmodalityCriteria(fixture.event.id);
    expect(saved.map((criterion) => criterion.name)).toEqual([
      "Técnica",
      "Interpretación",
    ]);
  });

  test("returns the total field error when the adding maxima do not total 100", async () => {
    const fixture = await seedJudgingFixture();

    const actionData = await submitCriteria(fixture, [
      { kind: "adds", maximum: "60", name: "Técnica" },
      { kind: "deducts", maximum: "40", name: "Caídas" },
    ]);

    expect(actionData).toMatchObject({
      status: "error",
      fieldErrors: {
        criteria: "El total de los criterios que suman debe ser igual a 100.",
      },
      scope: {
        intent: "save-submodality-criteria",
        recordId: fixture.catalog.submodality.id,
      },
    });
    await expect(listSubmodalityCriteria(fixture.event.id)).resolves.toEqual(
      [],
    );
  });

  test("returns the maximum field error when a maximum is not a whole number from 1", async () => {
    const fixture = await seedJudgingFixture();

    await expect(
      submitCriteria(fixture, [
        { kind: "adds", maximum: "100,5", name: "Técnica" },
      ]),
    ).resolves.toMatchObject({
      fieldErrors: {
        "criteria.0.maximum": "Ingresá un número entero desde 1.",
      },
    });
  });

  test("refuses the save once the submodality has a score", async () => {
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
      submitCriteria(fixture, [
        { kind: "adds", maximum: "100", name: "Técnica" },
      ]),
    ).resolves.toMatchObject({
      status: "error",
      message:
        "No se pueden cambiar los criterios porque la submodalidad ya tiene puntajes.",
    });
  });
});

async function submitCriteria(
  fixture: Awaited<ReturnType<typeof seedJudgingFixture>>,
  criteria: { kind: string; maximum: string; name: string }[],
) {
  const body = new FormData();
  body.set("intent", "save-submodality-criteria");
  body.set("id", fixture.catalog.submodality.id);
  body.set("modalityId", fixture.catalog.modality.id);
  criteria.forEach((criterion, index) => {
    body.set(`criteria.${index}.kind`, criterion.kind);
    body.set(`criteria.${index}.maximum`, criterion.maximum);
    body.set(`criteria.${index}.name`, criterion.name);
  });

  const { request } = await createSignedInAdminRequest({
    body,
    email: `${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost/administracion/modalidades/${fixture.catalog.modality.id}?evento=${fixture.event.id}`,
    role: "admin",
  });

  return updateAdministrativeEventModality(request);
}
