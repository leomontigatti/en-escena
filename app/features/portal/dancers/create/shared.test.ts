import { describe, test } from "vitest";

import { expectSharedBirthDateRules } from "@/lib/test-support/dancer-birth-date-schema";

import { buildCreateDancerSchema } from "./shared";

describe("portal dancer create schema", () => {
  test("applies the shared birth-date rules", () => {
    expectSharedBirthDateRules({
      buildSchema: buildCreateDancerSchema,
      values: { firstName: "Ana", lastName: "Paz" },
    });
  });
});
