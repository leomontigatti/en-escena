import { describe, expect, test } from "vitest";

import {
  assignJudgesIntent,
  formatJudgeAssignmentMessage,
  judgeAssignmentSchema,
  removeJudgesIntent,
  selectRemovableJudges,
  type PresentationListItem,
} from "./shared";

function buildItem(
  overrides: Partial<PresentationListItem> = {},
): PresentationListItem {
  return {
    academyName: "Academia Sur",
    assignedJudgeIds: [],
    categoryName: "Infantil",
    choreographyNumber: 1,
    financialStatus: "paidInFull",
    groupType: "solo",
    id: "choreography-1",
    modalityName: "Jazz",
    name: "Primera",
    orderNumber: 1,
    scheduledDate: "2026-05-01",
    submodalityName: null,
    warnings: [],
    ...overrides,
  };
}

const ana = { id: "judge-ana", name: "Ana Juez" };
const bruno = { id: "judge-bruno", name: "Bruno Juez" };

describe("selectRemovableJudges", () => {
  test("offers a judge assigned to at least one of the chosen rows", () => {
    const removable = selectRemovableJudges(
      [ana, bruno],
      [
        buildItem({ assignedJudgeIds: [ana.id], id: "choreography-1" }),
        buildItem({ assignedJudgeIds: [], id: "choreography-2" }),
      ],
    );

    expect(removable).toEqual([ana]);
  });

  test("offers nothing when no chosen row has a judge", () => {
    expect(selectRemovableJudges([ana, bruno], [buildItem()])).toEqual([]);
  });
});

describe("judgeAssignmentSchema", () => {
  test("accepts a direction with at least one presentation and one judge", () => {
    const parsed = judgeAssignmentSchema.safeParse({
      coreografia: ["choreography-1", "choreography-2"],
      intent: assignJudgesIntent,
      juez: [ana.id],
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.juez).toEqual([ana.id]);
  });

  test("asks for a judge when none was chosen", () => {
    const parsed = judgeAssignmentSchema.safeParse({
      coreografia: ["choreography-1"],
      intent: removeJudgesIntent,
      juez: [],
    });

    expect(
      parsed.error?.issues.map((issue) => [issue.path, issue.message]),
    ).toEqual([[["juez"], "Este campo es obligatorio."]]);
  });

  test("refuses an empty selection, which the dialog never submits", () => {
    const parsed = judgeAssignmentSchema.safeParse({
      coreografia: [],
      intent: assignJudgesIntent,
      juez: [ana.id],
    });

    expect(parsed.success).toBe(false);
  });

  test("refuses an intent that is not one of the two directions", () => {
    const parsed = judgeAssignmentSchema.safeParse({
      coreografia: ["choreography-1"],
      intent: "order-automatically",
      juez: [ana.id],
    });

    expect(parsed.success).toBe(false);
  });
});

describe("formatJudgeAssignmentMessage", () => {
  test("names how many judges reached how many presentations", () => {
    expect(
      formatJudgeAssignmentMessage({
        intent: assignJudgesIntent,
        judgeCount: 2,
        presentationCount: 3,
      }),
    ).toBe("Se asignaron 2 jueces a 3 presentaciones.");

    expect(
      formatJudgeAssignmentMessage({
        intent: removeJudgesIntent,
        judgeCount: 1,
        presentationCount: 1,
      }),
    ).toBe("Se quitó 1 juez de 1 presentación.");
  });
});
