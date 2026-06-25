import { describe, expect, test } from "vitest";

import * as schema from "@/db/schema";

describe("schema export surface", () => {
  test("re-exports the full schema from the main entry point", () => {
    expect(schema).toMatchObject({
      accessCredential: expect.anything(),
      accessSession: expect.anything(),
      academies: expect.anything(),
      administrativeAuditAction: expect.anything(),
      administrativeAuditEntries: expect.anything(),
      administrativeAuditEntityType: expect.anything(),
      categories: expect.anything(),
      categoryExperienceLevels: expect.anything(),
      categoryModalities: expect.anything(),
      choreographyCategoryCalculationMode: expect.anything(),
      choreographyDancers: expect.anything(),
      choreographyProfessors: expect.anything(),
      choreographies: expect.anything(),
      createTable: expect.anything(),
      dancers: expect.anything(),
      documentType: expect.anything(),
      events: expect.anything(),
      experienceLevels: expect.anything(),
      groupType: expect.anything(),
      internalUserInvitations: expect.anything(),
      modalities: expect.anything(),
      prices: expect.anything(),
      professors: expect.anything(),
      scheduleCapacities: expect.anything(),
      scheduleModalities: expect.anything(),
      schedules: expect.anything(),
      submodalities: expect.anything(),
      user: expect.anything(),
      userRole: expect.anything(),
    });
  });
});
