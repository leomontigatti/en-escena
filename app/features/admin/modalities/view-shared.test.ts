import { describe, expect, test } from "vitest";

import { modalityFormSchema } from "./view-shared";

function issuePaths(result: ReturnType<typeof modalityFormSchema.safeParse>) {
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join("."));
}

describe("modalityFormSchema", () => {
  test("accepts a modality with zero submodalities", () => {
    const result = modalityFormSchema.safeParse({
      name: "Jazz",
      submodalities: [],
    });

    expect(result.success).toBe(true);
  });

  test("accepts a modality with distinct submodality names", () => {
    const result = modalityFormSchema.safeParse({
      name: "Jazz",
      submodalities: [{ name: "Lírico" }, { name: "Musical" }],
    });

    expect(result.success).toBe(true);
  });

  test("flags a field error on the duplicated submodality name", () => {
    const result = modalityFormSchema.safeParse({
      name: "Jazz",
      submodalities: [{ name: "Lírico" }, { name: "Lírico" }],
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual(
      expect.arrayContaining(["submodalities.0.name", "submodalities.1.name"]),
    );
  });

  test("detects duplicate submodality names case- and whitespace-insensitively", () => {
    const result = modalityFormSchema.safeParse({
      name: "Jazz",
      submodalities: [{ name: "Lírico" }, { name: "  lírico  " }],
    });

    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("submodalities.1.name");
  });
});
