import { describe, expect, test } from "vitest";

import { mergeAcademies } from "@/lib/academies/academy-merge.server";

describe("mergeAcademies", () => {
  test("refuses merging an academy into itself", async () => {
    const academyId = crypto.randomUUID();

    await expect(
      mergeAcademies({ removedId: academyId, survivorId: academyId }),
    ).resolves.toEqual({
      ok: false,
      message: "Elegí otra academia para fusionar.",
    });
  });
});
