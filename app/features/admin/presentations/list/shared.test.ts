import { describe, expect, test } from "vitest";

import {
  assignJudgesIntent,
  formatAutomaticOrderingMessage,
  formatJudgeAssignmentMessage,
  judgeAssignmentSchema,
  presentationRowPath,
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
    evaluationStatus: "pending",
    experienceLevel: null,
    financialStatus: "paidInFull",
    frozen: false,
    groupType: "solo",
    id: "choreography-1",
    modalityName: "Jazz",
    name: "Primera",
    orderNumber: 1,
    presentationId: "presentation-1",
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

describe("formatJudgeAssignmentMessage with kept assignments", () => {
  test("names the scored assignments it kept beside what it removed", () => {
    expect(
      formatJudgeAssignmentMessage({
        intent: removeJudgesIntent,
        judgeCount: 2,
        keptCount: 1,
        presentationCount: 3,
      }),
    ).toBe(
      "Se quitaron 2 jueces de 3 presentaciones. Se mantuvo 1 asignación que ya tiene puntaje.",
    );

    expect(
      formatJudgeAssignmentMessage({
        intent: removeJudgesIntent,
        judgeCount: 1,
        keptCount: 2,
        presentationCount: 1,
      }),
    ).toBe(
      "Se quitó 1 juez de 1 presentación. Se mantuvieron 2 asignaciones que ya tienen puntaje.",
    );
  });

  test("says only why when every chosen pair already has a score", () => {
    expect(
      formatJudgeAssignmentMessage({
        intent: removeJudgesIntent,
        judgeCount: 0,
        keptCount: 1,
        presentationCount: 0,
      }),
    ).toBe("No se quitó nada: 1 asignación ya tiene puntaje.");

    expect(
      formatJudgeAssignmentMessage({
        intent: removeJudgesIntent,
        judgeCount: 0,
        keptCount: 3,
        presentationCount: 0,
      }),
    ).toBe("No se quitó nada: 3 asignaciones ya tienen puntaje.");
  });
});

describe("presentationRowPath", () => {
  test("sends a pending row to its choreography", () => {
    expect(
      presentationRowPath(
        buildItem({ evaluationStatus: "pending", presentationId: "p-1" }),
      ),
    ).toBe("/administracion/coreografias/choreography-1");
  });

  test("sends an evaluated row to its scores", () => {
    expect(
      presentationRowPath(
        buildItem({ evaluationStatus: "evaluated", presentationId: "p-1" }),
      ),
    ).toBe("/administracion/presentacion/p-1/puntajes");
  });

  test("sends a disqualified row to its scores", () => {
    expect(
      presentationRowPath(
        buildItem({ evaluationStatus: "disqualified", presentationId: "p-1" }),
      ),
    ).toBe("/administracion/presentacion/p-1/puntajes");
  });
});

describe("formatAutomaticOrderingMessage", () => {
  test("counts what it ordered, and what it left in place when there was any", () => {
    expect(
      formatAutomaticOrderingMessage({ frozenCount: 0, orderedCount: 32 }),
    ).toBe("Se ordenaron 32 presentaciones.");
    expect(
      formatAutomaticOrderingMessage({ frozenCount: 40, orderedCount: 1 }),
    ).toBe(
      "Se ordenó 1 presentación. Quedaron fijas 40 porque su cronograma ya fue evaluado.",
    );
    expect(
      formatAutomaticOrderingMessage({ frozenCount: 1, orderedCount: 2 }),
    ).toBe(
      "Se ordenaron 2 presentaciones. Quedó fija 1 porque su cronograma ya fue evaluado.",
    );
  });
});
