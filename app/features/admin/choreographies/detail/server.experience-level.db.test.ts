import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { categories, choreographies } from "@/db/schema";
import {
  createAcademySession,
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
  date,
} from "@/features/portal/choreographies/test-support/db";
import type { ExperienceLevel } from "@/lib/events/experience-levels";
import type { GroupType } from "@/lib/events/group-types";
import { evaluatedChoreographyMessage } from "@/lib/choreographies/choreography-locks";
import { evaluatedChoreographyIds } from "@/lib/presentations/evaluation-lock.test-support";
import { expectThrownResponse } from "@/lib/test-support/http";
import {
  loadDetail,
  saveDraftEdits,
  submitDraftAsAuditor,
  canPickExperienceLevel,
} from "@/features/admin/choreographies/detail/server.test-support";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

// The evaluated lock is the seam the judging effort will fill; until then it
// answers `false` for everything, so a test that needs a closed choreography
// declares it here.
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

describe("administrative choreography detail: experience level", () => {
  test("reassigns the experience level without touching the roster and bumps updatedAt", async () => {
    const staleUpdatedAt = date("2026-01-01T12:00:00Z");
    const scenario = await createExperienceLevelScenario({
      academyName: "Academia Nivel",
      slug: "nivel",
      updatedAt: staleUpdatedAt,
    });

    const response = await saveDraftEdits({
      choreographyId: scenario.choreography.id,
      edits: { experienceLevelId: "profesional" },
    });

    expect(response).not.toBeInstanceOf(Response);
    expect(response).toMatchObject({
      message: "Coreografía guardada.",
      status: "success",
    });
    await expect(scenario.readExperienceLevel()).resolves.toBe("profesional");

    const stored = await db.query.choreographies.findFirst({
      columns: { categoryId: true, updatedAt: true },
      where: eq(choreographies.id, scenario.choreography.id),
    });
    expect(stored?.categoryId).toBe(scenario.category.id);
    expect(stored?.updatedAt.getTime()).toBeGreaterThan(
      staleUpdatedAt.getTime(),
    );
  });

  test("resolves a missing experience level that left the choreography incomplete", async () => {
    const scenario = await createExperienceLevelScenario({
      academyName: "Academia Nivel Faltante",
      experienceLevelId: null,
      slug: "nivel.faltante",
    });

    const before = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.nivel.faltante.antes@example.com",
      role: "admin",
    });
    expect(before.choreography.operationalStatus.pendingItems).toContain(
      "experienceLevel",
    );
    expect(canPickExperienceLevel(before)).toBe(true);

    await saveDraftEdits({
      choreographyId: scenario.choreography.id,
      edits: { experienceLevelId: "amateur" },
    });

    const after = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.nivel.faltante.despues@example.com",
      role: "admin",
    });
    expect(after.choreography.operationalStatus.pendingItems).not.toContain(
      "experienceLevel",
    );
  });

  test("rejects a experience level the resolved category does not admit", async () => {
    const scenario = await createExperienceLevelScenario({
      academyName: "Academia Nivel Ajeno",
      slug: "nivel.ajeno",
    });

    const response = await saveDraftEdits({
      choreographyId: scenario.choreography.id,
      edits: { experienceLevelId: "elite" },
    });

    expect(response).toMatchObject({
      message: "Elegí un nivel de experiencia válido para esta coreografía.",
      status: "error",
    });
    await expect(scenario.readExperienceLevel()).resolves.toBe("amateur");
  });

  test("rejects a blank experience level when the category requires one", async () => {
    const scenario = await createExperienceLevelScenario({
      academyName: "Academia Nivel Vacío",
      slug: "nivel.vacio",
    });

    const response = await saveDraftEdits({
      choreographyId: scenario.choreography.id,
      edits: { experienceLevelId: "" },
    });

    expect(response).toMatchObject({
      message: "Elegí un nivel de experiencia válido para esta coreografía.",
      status: "error",
    });
    await expect(scenario.readExperienceLevel()).resolves.toBe("amateur");
  });

  test("blocks the reassignment when the choreography was evaluated", async () => {
    const scenario = await createExperienceLevelScenario({
      academyName: "Academia Nivel Evaluada",
      isEvaluated: true,
      slug: "nivel.evaluada",
    });

    const response = await saveDraftEdits({
      choreographyId: scenario.choreography.id,
      edits: { experienceLevelId: "profesional" },
    });

    expect(response).toMatchObject({
      message: evaluatedChoreographyMessage,
      status: "error",
    });
    await expect(scenario.readExperienceLevel()).resolves.toBe("amateur");
  });

  // The same condition that closes the field in the loader: a hand-crafted POST
  // cannot write a column the rest of the domain assumes is null.
  test("rejects a reassignment the read-only field never offers, with a category without levels", async () => {
    const scenario = await createExperienceLevelScenario({
      academyName: "Academia Nivel Sin Niveles",
      categoryExperienceLevels: [],
      experienceLevelId: null,
      slug: "nivel.sinniveles",
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.nivel.sinniveles.loader@example.com",
      role: "admin",
    });
    expect(canPickExperienceLevel(detail)).toBe(false);

    const response = await saveDraftEdits({
      choreographyId: scenario.choreography.id,
      edits: { experienceLevelId: "amateur" },
    });

    expect(response).toMatchObject({
      message: "Elegí un nivel de experiencia válido para esta coreografía.",
      status: "error",
    });
    await expect(scenario.readExperienceLevel()).resolves.toBeNull();
  });

  test.each([
    ["grupal", "optional"],
    ["solo", "required"],
  ] as const)(
    "reads a %s's level in a levelled category as %s",
    async (groupType, requirement) => {
      const scenario = await createExperienceLevelScenario({
        academyName: `Academia Nivel ${groupType}`,
        experienceLevelId: null,
        groupType,
        slug: `nivel.${groupType}`,
      });

      const detail = await loadDetail({
        choreographyId: scenario.choreography.id,
        email: `admin.coreografias.nivel.${groupType}@example.com`,
        role: "admin",
      });

      expect(detail.choreography.experienceLevelRequirement).toBe(requirement);
    },
  );

  test("keeps the field open with a single admitted level", async () => {
    const scenario = await createExperienceLevelScenario({
      academyName: "Academia Nivel Único",
      categoryExperienceLevels: ["amateur"],
      experienceLevelId: null,
      slug: "nivel.unico",
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.nivel.unico@example.com",
      role: "admin",
    });

    expect(canPickExperienceLevel(detail)).toBe(true);
    expect(detail.choreography.experienceLevelOptions).toEqual([
      { id: "amateur", name: "Amateur" },
    ]);
  });

  // The options carry only what the category admits today, so a drifted level
  // cannot be picked from the select. The mismatch alert is what keeps the
  // stored value legible, and a save that leaves it alone keeps it: only a level
  // the administrator picks is checked against the category.
  test("drops a drifted assigned level from the options and reports it, and a rename keeps it", async () => {
    const scenario = await createExperienceLevelScenario({
      academyName: "Academia Nivel Derivado",
      categoryExperienceLevels: ["profesional"],
      experienceLevelId: "amateur",
      slug: "nivel.derivado",
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.nivel.derivado@example.com",
      role: "admin",
    });

    expect(detail.choreography.experienceLevelOptions).toEqual([
      { id: "profesional", name: "Profesional" },
    ]);
    expect(detail.choreography.experienceLevelId).toBe("amateur");
    expect(detail.choreography.operationalStatus).toMatchObject({
      code: "incomplete",
    });
    expect(detail.choreography.operationalStatus.pendingItems).toContain(
      "experienceLevelMismatch",
    );

    const renamed = await saveDraftEdits({
      choreographyId: scenario.choreography.id,
      edits: { name: "Renombrada" },
    });
    expect(renamed).toMatchObject({ status: "success" });
    await expect(scenario.readExperienceLevel()).resolves.toBe("amateur");

    const picked = await saveDraftEdits({
      choreographyId: scenario.choreography.id,
      edits: { experienceLevelId: "elite" },
    });
    expect(picked).toMatchObject({
      message: "Elegí un nivel de experiencia válido para esta coreografía.",
      status: "error",
    });
    await expect(scenario.readExperienceLevel()).resolves.toBe("amateur");
  });

  // A category edited after the choreography was filed leaves it competing in a
  // range it no longer belongs to, and nothing else in the app re-checks it.
  test("reports a stored age the category no longer contains", async () => {
    const scenario = await createExperienceLevelScenario({
      academyName: "Academia Edad Ajena",
      categoryAgeBasis: 25,
      slug: "edad.ajena",
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.edad.ajena@example.com",
      role: "admin",
    });

    expect(detail.choreography.operationalStatus).toMatchObject({
      code: "incomplete",
    });
    expect(detail.choreography.operationalStatus.pendingItems).toContain(
      "categoryAgeMismatch",
    );
  });

  test("leaves a choreography that still fits its category unflagged", async () => {
    const scenario = await createExperienceLevelScenario({
      academyName: "Academia Edad Propia",
      categoryAgeBasis: 17,
      slug: "edad.propia",
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.edad.propia@example.com",
      role: "admin",
    });

    expect(detail.choreography.operationalStatus.pendingItems).not.toContain(
      "categoryAgeMismatch",
    );
    expect(detail.choreography.operationalStatus.pendingItems).not.toContain(
      "experienceLevelMismatch",
    );
  });

  test("blocks auditors from reassigning the experience level", async () => {
    const scenario = await createExperienceLevelScenario({
      academyName: "Academia Nivel Auditor",
      slug: "nivel.auditor",
    });

    await expectThrownResponse(
      submitDraftAsAuditor({
        choreographyId: scenario.choreography.id,
        edits: { experienceLevelId: "profesional" },
      }),
      403,
    );
    await expect(scenario.readExperienceLevel()).resolves.toBe("amateur");
  });
});

/**
 * The shared catalogue brings a category with a single level; here we need one
 * that admits more than one, so the value can actually be moved.
 */
async function createCategoryWithLevels(input: {
  eventId: string;
  experienceLevels: ExperienceLevel[];
  name: string;
}) {
  const [category] = await db
    .insert(categories)
    .values({
      eventId: input.eventId,
      name: input.name,
      minAge: 13,
      maxAge: 17,
      groupTypes: ["solo"],
      groupTypeKey: "solo",
      experienceLevels: input.experienceLevels,
      experienceLevelKey: input.experienceLevels.join("|"),
    })
    .returning();

  return category;
}

async function createExperienceLevelScenario(input: {
  academyName: string;
  categoryAgeBasis?: number | null;
  categoryExperienceLevels?: ExperienceLevel[];
  experienceLevelId?: ExperienceLevel | null;
  groupType?: GroupType;
  isEvaluated?: boolean;
  slug: string;
  updatedAt?: Date;
}) {
  const owner = await createAcademySession({
    academyName: input.academyName,
    email: `admin.coreografias.${input.slug}.academia@example.com`,
  });
  const event = await createEventRecord({
    active: true,
    name: "Regional 2026",
  });
  const catalog = await createEventCatalog(event.id);
  const category = await createCategoryWithLevels({
    eventId: event.id,
    experienceLevels: input.categoryExperienceLevels ?? [
      "amateur",
      "profesional",
    ],
    name: `Niveles ${input.slug}`,
  });
  const choreography = await createChoreographyRecord({
    academyId: owner.academyId,
    categoryAgeBasis:
      input.categoryAgeBasis === undefined ? 13 : input.categoryAgeBasis,
    categoryId: category.id,
    eventId: event.id,
    experienceLevelId:
      input.experienceLevelId === undefined
        ? "amateur"
        : input.experienceLevelId,
    groupType: input.groupType,
    modalityId: catalog.modality.id,
    name: `Nivel ${input.slug}`,
    scheduleCapacityId: catalog.scheduleCapacity.id,
    submodalityId: catalog.submodality.id,
    updatedAt: input.updatedAt,
  });

  if (input.isEvaluated) {
    evaluatedChoreographyIds.add(choreography.id);
  }

  return {
    catalog,
    category,
    choreography,
    event,
    owner,
    readExperienceLevel: async () =>
      (
        await db.query.choreographies.findFirst({
          columns: { experienceLevelId: true },
          where: eq(choreographies.id, choreography.id),
        })
      )?.experienceLevelId ?? null,
  };
}
