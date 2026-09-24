import { describe, expect, test } from "vitest";

import { findResumePresentationId } from "./resume";

const rows = [
  { presentationId: "a", status: "noFeedback" as const },
  { presentationId: "b", status: "pending" as const },
  { presentationId: "c", status: "disqualified" as const },
  { presentationId: "d", status: "pending" as const },
];

describe("where the judge picks the list back up", () => {
  test("is the first pending presentation when nothing was opened yet", () => {
    expect(findResumePresentationId(rows, null)).toBe("b");
  });

  test("is the first pending one after the last one opened", () => {
    expect(findResumePresentationId(rows, "b")).toBe("d");
  });

  test("goes back to the first pending one when the day ends after the last opened", () => {
    expect(findResumePresentationId(rows, "d")).toBe("b");
  });

  test("ignores a presentation that is no longer on the list", () => {
    expect(findResumePresentationId(rows, "gone")).toBe("b");
  });

  test("marks nothing once every presentation is scored", () => {
    expect(
      findResumePresentationId(
        [{ presentationId: "a", status: "complete" }],
        "a",
      ),
    ).toBeNull();
  });
});
