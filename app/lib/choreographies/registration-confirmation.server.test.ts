import { describe, expect, test } from "vitest";

import { createChoreographyRegistration } from "@/lib/choreographies/registration-confirmation.server";

// Both refusals answer before the first query: one that reached the database
// would throw here, where none is configured, so nothing can have been written.
describe("createChoreographyRegistration", () => {
  test("rejects placeholder-only choreography names before inserting records", async () => {
    await expect(
      createChoreographyRegistration(registration({ name: "-" })),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-name",
      error: "Ingresá un nombre válido para la coreografía.",
    });
  });

  test("rejects a choreography without professors on final confirmation", async () => {
    await expect(
      createChoreographyRegistration(registration({ professorIds: [] })),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-professors",
      error: "Elegí uno o más profesores válidos para la coreografía.",
    });
  });
});

function registration(
  overrides: Partial<Parameters<typeof createChoreographyRegistration>[0]>,
): Parameters<typeof createChoreographyRegistration>[0] {
  return {
    academyId: crypto.randomUUID(),
    eventId: crypto.randomUUID(),
    name: "Pieza",
    modalityId: crypto.randomUUID(),
    submodalityId: crypto.randomUUID(),
    dancerIds: [crypto.randomUUID()],
    professorIds: [crypto.randomUUID()],
    experienceLevelId: crypto.randomUUID(),
    scheduleCapacityId: crypto.randomUUID(),
    ...overrides,
  };
}
