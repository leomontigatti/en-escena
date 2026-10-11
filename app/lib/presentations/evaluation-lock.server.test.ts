import { describe, expect, test } from "vitest";

import { findEvaluatedChoreographyIds } from "@/lib/presentations/evaluation-lock.server";

describe("findEvaluatedChoreographyIds", () => {
  test("answers an empty set for an empty batch without reaching the database", async () => {
    expect(await findEvaluatedChoreographyIds([])).toEqual(new Set());
  });
});
