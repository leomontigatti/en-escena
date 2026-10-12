import { describe, expect, test } from "vitest";

import {
  editJudgesIntent,
  formatAutomaticOrderingMessage,
  formatJudgeAssignmentMessage,
  judgeEditSchema,
  presentationRowPath,
  readJudgeChoices,
  readJudgeEditOutcome,
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
    professionalEvaluation: false,
    scheduledDate: "2026-05-01",
    submodalityName: null,
    warnings: [],
    ...overrides,
  };
}

const ana = { id: "judge-ana", name: "Ana Juez" };
const bruno = { id: "judge-bruno", name: "Bruno Juez" };
const carla = { id: "judge-carla", name: "Carla Juez" };

describe("readJudgeChoices", () => {
  // The state of each judge across the chosen rows is what the dialog's
  // checkbox starts from: checked, mixed or unchecked.
  test("reads each judge as on every chosen row, on some, or on none", () => {
    const choices = readJudgeChoices({
      assignableJudges: [ana, bruno, carla],
      assignedJudges: [ana, bruno],
      selectedRows: [
        buildItem({ assignedJudgeIds: [ana.id, bruno.id] }),
        buildItem({ assignedJudgeIds: [ana.id], id: "choreography-2" }),
      ],
    });

    expect(choices).toEqual([
      { ...ana, assignable: true, state: "all" },
      { ...bruno, assignable: true, state: "some" },
      { ...carla, assignable: true, state: "none" },
    ]);
  });

  // A suspended judge is no longer assignable, but one still on a chosen row
  // can be taken off it.
  test("offers a judge the selection has even when no longer assignable", () => {
    const choices = readJudgeChoices({
      assignableJudges: [bruno],
      assignedJudges: [ana],
      selectedRows: [buildItem({ assignedJudgeIds: [ana.id] })],
    });

    expect(choices).toEqual([
      { ...bruno, assignable: true, state: "none" },
      { ...ana, assignable: false, state: "all" },
    ]);
  });
});

describe("judgeEditSchema", () => {
  test("accepts judges to add, to remove, or both, over the chosen rows", () => {
    const parsed = judgeEditSchema.safeParse({
      agregar: [bruno.id],
      coreografia: ["choreography-1", "choreography-2"],
      intent: editJudgesIntent,
      quitar: [ana.id],
    });

    expect(parsed.data).toEqual({
      agregar: [bruno.id],
      coreografia: ["choreography-1", "choreography-2"],
      intent: editJudgesIntent,
      quitar: [ana.id],
    });
  });

  test("refuses an edit that changes no judge", () => {
    const parsed = judgeEditSchema.safeParse({
      agregar: [],
      coreografia: ["choreography-1"],
      intent: editJudgesIntent,
      quitar: [],
    });

    expect(parsed.success).toBe(false);
  });

  test("refuses an empty selection, which the dialog never submits", () => {
    const parsed = judgeEditSchema.safeParse({
      agregar: [ana.id],
      coreografia: [],
      intent: editJudgesIntent,
      quitar: [],
    });

    expect(parsed.success).toBe(false);
  });

  test("refuses a judge both added and removed", () => {
    const parsed = judgeEditSchema.safeParse({
      agregar: [ana.id],
      coreografia: ["choreography-1"],
      intent: editJudgesIntent,
      quitar: [ana.id],
    });

    expect(parsed.success).toBe(false);
  });
});

describe("formatJudgeAssignmentMessage", () => {
  test("names how many judges reached how many presentations", () => {
    expect(
      formatJudgeAssignmentMessage({
        direction: "assign",
        judgeCount: 2,
        presentationCount: 3,
      }),
    ).toBe("Se asignaron 2 jueces a 3 presentaciones.");

    expect(
      formatJudgeAssignmentMessage({
        direction: "remove",
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
        direction: "remove",
        judgeCount: 2,
        keptCount: 1,
        presentationCount: 3,
      }),
    ).toBe(
      "Se quitaron 2 jueces de 3 presentaciones. Se mantuvo 1 asignación que ya tiene puntaje.",
    );

    expect(
      formatJudgeAssignmentMessage({
        direction: "remove",
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
        direction: "remove",
        judgeCount: 0,
        keptCount: 1,
        presentationCount: 0,
      }),
    ).toBe("No se quitó nada: 1 asignación ya tiene puntaje.");

    expect(
      formatJudgeAssignmentMessage({
        direction: "remove",
        judgeCount: 0,
        keptCount: 3,
        presentationCount: 0,
      }),
    ).toBe("No se quitó nada: 3 asignaciones ya tienen puntaje.");
  });
});

describe("readJudgeEditOutcome", () => {
  test("says both halves of an edit that adds and removes", () => {
    expect(
      readJudgeEditOutcome({
        assigned: { judgeCount: 1, presentationCount: 2 },
        removed: { judgeCount: 1, keptCount: 0, presentationCount: 2 },
      }),
    ).toEqual({
      message:
        "Se asignó 1 juez a 2 presentaciones. Se quitó 1 juez de 2 presentaciones.",
      refused: false,
    });
  });

  // A kept pair beside an assignment that went is still a success.
  test("refuses only an edit that reached nothing for the scores it kept", () => {
    expect(
      readJudgeEditOutcome({
        assigned: null,
        removed: { judgeCount: 0, keptCount: 1, presentationCount: 0 },
      }).refused,
    ).toBe(true);
    expect(
      readJudgeEditOutcome({
        assigned: { judgeCount: 1, presentationCount: 1 },
        removed: { judgeCount: 0, keptCount: 1, presentationCount: 0 },
      }).refused,
    ).toBe(false);
  });
});

describe("presentationRowPath", () => {
  test("sends a pending row to its panel, so its judges can be read", () => {
    expect(
      presentationRowPath(
        buildItem({ evaluationStatus: "pending", presentationId: "p-1" }),
      ),
    ).toBe("/administracion/presentaciones/p-1/puntajes");
  });

  test("leaves a row without a presentation without a link", () => {
    expect(
      presentationRowPath(
        buildItem({ evaluationStatus: "pending", presentationId: null }),
      ),
    ).toBeNull();
  });

  test("sends an evaluated row to its scores", () => {
    expect(
      presentationRowPath(
        buildItem({ evaluationStatus: "evaluated", presentationId: "p-1" }),
      ),
    ).toBe("/administracion/presentaciones/p-1/puntajes");
  });

  test("sends a disqualified row to its scores", () => {
    expect(
      presentationRowPath(
        buildItem({ evaluationStatus: "disqualified", presentationId: "p-1" }),
      ),
    ).toBe("/administracion/presentaciones/p-1/puntajes");
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
