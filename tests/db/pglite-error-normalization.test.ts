import { describe, expect, test } from "vitest";

import { normalizePgliteError } from "./pglite-error-normalization";

describe("normalizePgliteError", () => {
  test("copies constraint metadata onto the postgres-js field name", () => {
    const error = new Error("duplicate key value violates unique constraint", {
      cause: {
        code: "23505",
        constraint: "event_single_active_unique",
      },
    });

    normalizePgliteError(error);

    expect(error.cause).toMatchObject({
      code: "23505",
      constraint: "event_single_active_unique",
      constraint_name: "event_single_active_unique",
    });
  });
});
