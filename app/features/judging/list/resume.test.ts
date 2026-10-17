import { describe, expect, test } from "vitest";

import {
  findResumeMarkerPresentationId,
  findResumePresentationId,
} from "./resume";

const rows = [
  { presentationId: "a", status: "noFeedback" as const, withdrawn: false },
  { presentationId: "b", status: "pending" as const, withdrawn: false },
  { presentationId: "c", status: "disqualified" as const, withdrawn: false },
  { presentationId: "d", status: "pending" as const, withdrawn: false },
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
        [{ presentationId: "a", status: "complete", withdrawn: false }],
        "a",
      ),
    ).toBeNull();
  });

  test("skips a withdrawn presentation, which has nothing left to score", () => {
    const withWithdrawn = [
      { presentationId: "a", status: "pending" as const, withdrawn: false },
      { presentationId: "b", status: "pending" as const, withdrawn: true },
      { presentationId: "c", status: "pending" as const, withdrawn: false },
    ];

    expect(findResumePresentationId(withWithdrawn, "a")).toBe("c");
    expect(
      findResumePresentationId(withWithdrawn.slice(1, 2), null),
    ).toBeNull();
  });
});

describe("the resume marker on the list", () => {
  test("is where the judge picks the list back up on the open day", () => {
    expect(findResumeMarkerPresentationId(rows, "b", true)).toBe("d");
  });

  test("is on no presentation on a day that is not open", () => {
    expect(findResumeMarkerPresentationId(rows, "b", false)).toBeNull();
    expect(findResumeMarkerPresentationId(rows, null, false)).toBeNull();
  });
});
