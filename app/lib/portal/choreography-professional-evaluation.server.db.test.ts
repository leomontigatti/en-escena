import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import { updateChoreographyProfessionalEvaluation } from "@/lib/portal/choreography-professional-evaluation.server";
import { evaluatedChoreographyIds } from "@/lib/presentations/evaluation-lock.test-support";
import {
  createAcademySession,
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

// Reaching a real evaluation means a score on an assigned judge, which is not
// this file's subject, so a test that needs a closed choreography declares it
// through the stub instead.
vi.mock(
  "@/lib/presentations/evaluation-lock.server",
  async () =>
    (await import("@/lib/presentations/evaluation-lock.test-support"))
      .evaluationLockStub,
);

beforeEach(() => {
  evaluatedChoreographyIds.clear();
});

installDatabaseTestHooks();

describe("portal choreography professional evaluation", () => {
  test("lets the academy ask for it and take the request back", async () => {
    const { choreography, event, owner } = await createFixture({
      academyName: "Academia Exigente",
      email: "evaluacion.profesional@example.com",
    });

    await expect(
      updateChoreographyProfessionalEvaluation({
        academyId: owner.academyId,
        choreographyId: choreography.id,
        eventId: event.id,
        professionalEvaluation: true,
      }),
    ).resolves.toEqual({ ok: true });
    await expect(readFlag(choreography.id)).resolves.toBe(true);

    await expect(
      updateChoreographyProfessionalEvaluation({
        academyId: owner.academyId,
        choreographyId: choreography.id,
        eventId: event.id,
        professionalEvaluation: false,
      }),
    ).resolves.toEqual({ ok: true });
    await expect(readFlag(choreography.id)).resolves.toBe(false);
  });

  test("refuses the change once the choreography was evaluated, and leaves it as it was", async () => {
    const { choreography, event, owner } = await createFixture({
      academyName: "Academia Evaluada",
      email: "evaluacion.profesional.evaluada@example.com",
      isEvaluated: true,
    });

    await expect(
      updateChoreographyProfessionalEvaluation({
        academyId: owner.academyId,
        choreographyId: choreography.id,
        eventId: event.id,
        professionalEvaluation: true,
      }),
    ).resolves.toEqual({
      ok: false,
      message:
        "No podés cambiar cómo se evalúa porque la coreografía ya fue evaluada.",
    });
    await expect(readFlag(choreography.id)).resolves.toBe(false);
  });

  test("saves nothing, and refuses nothing, when the answer is the one stored", async () => {
    const { choreography, event, owner } = await createFixture({
      academyName: "Academia Quieta",
      email: "evaluacion.profesional.quieta@example.com",
      isEvaluated: true,
    });

    await expect(
      updateChoreographyProfessionalEvaluation({
        academyId: owner.academyId,
        choreographyId: choreography.id,
        eventId: event.id,
        professionalEvaluation: false,
      }),
    ).resolves.toEqual({ ok: true });
  });
});

async function readFlag(choreographyId: string) {
  const row = await db.query.choreographies.findFirst({
    columns: { professionalEvaluation: true },
    where: eq(choreographies.id, choreographyId),
  });

  return row?.professionalEvaluation;
}

async function createFixture(input: {
  academyName: string;
  email: string;
  isEvaluated?: boolean;
}) {
  const owner = await createAcademySession({
    academyName: input.academyName,
    email: input.email,
  });
  const event = await createEventRecord({ active: true });
  const catalog = await createEventCatalog(event.id);
  const choreography = await createChoreographyRecord({
    academyId: owner.academyId,
    categoryId: catalog.categoryWithLevel.id,
    eventId: event.id,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    name: "Luna de Papel",
    scheduleCapacityId: catalog.scheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });

  if (input.isEvaluated) {
    evaluatedChoreographyIds.add(choreography.id);
  }

  return { choreography, event, owner };
}
