import { describe, test } from "vitest";

import { expectSharedBirthDateRules } from "@/lib/test-support/dancer-birth-date-schema";

import { buildDancerUpdateSchema } from "./shared";

describe("admin dancer update schema", () => {
  test("applies the shared birth-date rules", () => {
    expectSharedBirthDateRules({
      buildSchema: buildDancerUpdateSchema,
      values: {
        firstName: "Ana",
        lastName: "Paz",
        documentType: "",
        documentNumber: "",
        documentFrontImageStorageKey: "",
        documentBackImageStorageKey: "",
      },
    });
  });
});
