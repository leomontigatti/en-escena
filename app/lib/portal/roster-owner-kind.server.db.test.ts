import { describe, expect, test } from "vitest";

import {
  createDancerForAcademy,
  listDancersForAcademy,
} from "@/lib/portal/dancers.server";
import {
  createAcademyProfessor,
  listAcademyProfessors,
} from "@/lib/portal/professors.server";
import { createAcademyUser } from "@/lib/test-support/academies";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

// An individual's roster is itself (ADR-0019): no roster person is ever
// loaded under its owner row.
describe("roster creation under an owner row of kind individual", () => {
  test("refuses a dancer", async () => {
    const { academyId } = await createAcademyUser({
      academyName: "Ana Particular",
      email: "ana.particular@example.com",
      kind: "individual",
    });

    await expect(
      createDancerForAcademy(academyId, {
        birthDate: "2010-01-01",
        documentNumber: "",
        documentType: "",
        firstName: "Ana",
        lastName: "Gómez",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(listDancersForAcademy(academyId)).resolves.toEqual([]);
  });

  test("refuses a professor", async () => {
    const { academyId } = await createAcademyUser({
      academyName: "Ana Particular",
      email: "ana.particular@example.com",
      kind: "individual",
    });

    await expect(
      createAcademyProfessor(academyId, {
        documentNumber: "",
        documentType: "",
        firstName: "Ana",
        lastName: "Gómez",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(listAcademyProfessors(academyId)).resolves.toEqual([]);
  });
});
