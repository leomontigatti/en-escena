import { describe, expect, test } from "vitest";

import {
  isForeignKeyViolation,
  isUniqueViolation,
  readErrorProperty,
} from "@/lib/shared/error-properties.server";

describe("readErrorProperty", () => {
  test("reads the property from the error itself", () => {
    expect(readErrorProperty({ code: "23505" }, "code")).toBe("23505");
  });

  test("walks the cause chain", () => {
    const error = new Error("insert failed", {
      cause: { cause: { constraint_name: "event_single_active_unique" } },
    });

    expect(readErrorProperty(error, "constraint_name")).toBe(
      "event_single_active_unique",
    );
  });

  test("returns null when no link of the chain has the property", () => {
    expect(readErrorProperty(new Error("boom"), "code")).toBeNull();
  });
});

describe("isUniqueViolation", () => {
  test("matches a driver error carrying the unique-violation code", () => {
    expect(
      isUniqueViolation(new Error("x", { cause: { code: "23505" } })),
    ).toBe(true);
  });

  test("rejects any other SQLSTATE", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
  });

  test("narrows by constraint name when one is given", () => {
    const error = {
      code: "23505",
      constraint_name: "event_single_active_unique",
    };

    expect(isUniqueViolation(error, "event_single_active_unique")).toBe(true);
    expect(isUniqueViolation(error, "en_escena_user_email_unique")).toBe(false);
  });

  test("rejects an error without a constraint name when one is required", () => {
    expect(isUniqueViolation({ code: "23505" }, "some_constraint")).toBe(false);
  });
});

describe("isForeignKeyViolation", () => {
  test("matches the foreign-key-violation code", () => {
    expect(isForeignKeyViolation({ code: "23503" })).toBe(true);
    expect(isForeignKeyViolation({ code: "23505" })).toBe(false);
  });

  test("narrows by constraint name when one is given", () => {
    const error = {
      code: "23503",
      constraint_name: "choreography_category_fk",
    };

    expect(isForeignKeyViolation(error, "choreography_category_fk")).toBe(true);
    expect(isForeignKeyViolation(error, "other_fk")).toBe(false);
  });
});
