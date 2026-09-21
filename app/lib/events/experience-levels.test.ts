import { describe, expect, test } from "vitest";

import {
  experienceLevelOrder,
  experienceLevelValues,
} from "./experience-levels";

describe("experienceLevelOrder", () => {
  test("holds every experience level exactly once", () => {
    expect([...experienceLevelOrder].sort()).toEqual(
      [...experienceLevelValues].sort(),
    );
  });
});
