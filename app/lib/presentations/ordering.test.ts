import { describe, expect, test } from "vitest";

import {
  computeAutomaticOrder,
  computeManualMove,
  findFrozenChoreographyIds,
  isPresentationEligible,
  movePosition,
  type PresentationOrderingRow,
} from "./ordering";

type RowOverrides = Partial<PresentationOrderingRow> & {
  choreographyId: string;
  choreographyNumber: number;
};

function row({
  choreographyId,
  choreographyNumber,
  ...overrides
}: RowOverrides): PresentationOrderingRow {
  return {
    activeDancerIds: [],
    category: { maxAge: 12, minAge: 1, name: "Infantil" },
    choreographyId,
    choreographyNumber,
    experienceLevel: null,
    financialStatus: "depositMet",
    groupType: "solo",
    orderNumber: null,
    schedule: {
      id: "schedule-1",
      name: "Sala A",
      scheduledDate: "2026-05-01",
      startTime: "10:00",
    },
    ...overrides,
  };
}

function orderOf(
  rows: PresentationOrderingRow[],
  frozenChoreographyIds = new Set<string>(),
) {
  const result = computeAutomaticOrder(rows, frozenChoreographyIds);

  if (!result.ok) {
    throw new Error(`Unexpected refusal: ${result.reason}`);
  }

  return [...result.placements]
    .sort((left, right) => left.orderNumber - right.orderNumber)
    .map((placement) => placement.choreographyId);
}

/** The placements as `[choreographyId, orderNumber]` pairs, by number. */
function placementsOf(
  rows: PresentationOrderingRow[],
  frozenChoreographyIds: Set<string>,
) {
  const result = computeAutomaticOrder(rows, frozenChoreographyIds);

  if (!result.ok) {
    throw new Error(`Unexpected refusal: ${result.reason}`);
  }

  return [...result.placements]
    .sort((left, right) => left.orderNumber - right.orderNumber)
    .map((placement) => [placement.choreographyId, placement.orderNumber]);
}

const dayOne = {
  id: "day-1",
  name: "Sala A",
  scheduledDate: "2026-05-01",
  startTime: "10:00",
};
const dayTwo = {
  id: "day-2",
  name: "Sala A",
  scheduledDate: "2026-05-02",
  startTime: "10:00",
};
const dayThree = {
  id: "day-3",
  name: "Sala A",
  scheduledDate: "2026-05-03",
  startTime: "10:00",
};

function shuffle<Item>(items: Item[], seed: number) {
  return [...items].sort(
    (left, right) =>
      hash(`${seed}-${JSON.stringify(left)}`) -
      hash(`${seed}-${JSON.stringify(right)}`),
  );
}

function hash(value: string) {
  let result = 0;

  for (const character of value) {
    result = (result * 31 + character.codePointAt(0)!) % 100_000;
  }

  return result;
}

describe("isPresentationEligible", () => {
  test("requires the choreography to be at least `Señada`", () => {
    expect(isPresentationEligible({ financialStatus: "depositPending" })).toBe(
      false,
    );
    expect(isPresentationEligible({ financialStatus: "depositMet" })).toBe(
      true,
    );
    expect(isPresentationEligible({ financialStatus: "paidInFull" })).toBe(
      true,
    );
  });
});

describe("computeAutomaticOrder", () => {
  test("refuses when there is nothing to order", () => {
    expect(computeAutomaticOrder([])).toEqual({
      ok: false,
      reason: "nothingToOrder",
    });
  });

  test("refuses when every choreography is below `Señada` and unnumbered", () => {
    expect(
      computeAutomaticOrder([
        row({
          choreographyId: "a",
          choreographyNumber: 1,
          financialStatus: "depositPending",
        }),
      ]),
    ).toEqual({ ok: false, reason: "nothingToOrder" });
  });

  test("orders a block by choreography number", () => {
    expect(
      orderOf([
        row({ choreographyId: "c", choreographyNumber: 30 }),
        row({ choreographyId: "a", choreographyNumber: 10 }),
        row({ choreographyId: "b", choreographyNumber: 20 }),
      ]),
    ).toEqual(["a", "b", "c"]);
  });

  test("blocks by schedule date, then start time, then name", () => {
    const rows = [
      row({
        choreographyId: "late-day",
        choreographyNumber: 1,
        schedule: {
          id: "s3",
          name: "Sala A",
          scheduledDate: "2026-05-02",
          startTime: "09:00",
        },
      }),
      row({
        choreographyId: "second-name",
        choreographyNumber: 2,
        schedule: {
          id: "s2",
          name: "Sala B",
          scheduledDate: "2026-05-01",
          startTime: "09:00",
        },
      }),
      row({
        choreographyId: "first",
        choreographyNumber: 3,
        schedule: {
          id: "s1",
          name: "Sala A",
          scheduledDate: "2026-05-01",
          startTime: "09:00",
        },
      }),
      row({
        choreographyId: "later-time",
        choreographyNumber: 4,
        schedule: {
          id: "s4",
          name: "Sala A",
          scheduledDate: "2026-05-01",
          startTime: "18:00",
        },
      }),
    ];

    expect(orderOf(rows)).toEqual([
      "first",
      "second-name",
      "later-time",
      "late-day",
    ]);
  });

  test("blocks by category age order, then category name, then group type", () => {
    const rows = [
      row({
        choreographyId: "teen-duo",
        choreographyNumber: 1,
        category: { maxAge: 100, minAge: 13, name: "Juvenil" },
        groupType: "duo",
      }),
      row({
        choreographyId: "teen-solo",
        choreographyNumber: 2,
        category: { maxAge: 100, minAge: 13, name: "Juvenil" },
        groupType: "solo",
      }),
      row({
        choreographyId: "child-wide",
        choreographyNumber: 3,
        category: { maxAge: 12, minAge: 1, name: "Infantil amplia" },
      }),
      row({
        choreographyId: "child-narrow",
        choreographyNumber: 4,
        category: { maxAge: 8, minAge: 1, name: "Infantil" },
      }),
      row({
        choreographyId: "child-same-range",
        choreographyNumber: 5,
        category: { maxAge: 8, minAge: 1, name: "Aguas" },
      }),
      row({
        choreographyId: "teen-grupal",
        choreographyNumber: 6,
        category: { maxAge: 100, minAge: 13, name: "Juvenil" },
        groupType: "grupal",
      }),
      row({
        choreographyId: "teen-trio",
        choreographyNumber: 7,
        category: { maxAge: 100, minAge: 13, name: "Juvenil" },
        groupType: "trio",
      }),
    ];

    expect(orderOf(rows)).toEqual([
      "child-same-range",
      "child-narrow",
      "child-wide",
      "teen-solo",
      "teen-duo",
      "teen-trio",
      "teen-grupal",
    ]);
  });

  test("blocks by experience level before category, within one schedule", () => {
    const rows = [
      row({
        choreographyId: "amateur-child",
        choreographyNumber: 1,
        experienceLevel: "amateur",
      }),
      row({
        choreographyId: "nudo-teen",
        choreographyNumber: 2,
        category: { maxAge: 100, minAge: 13, name: "Juvenil" },
        experienceLevel: "nudo",
      }),
      row({
        choreographyId: "elite-child",
        choreographyNumber: 3,
        experienceLevel: "elite",
      }),
      row({
        choreographyId: "nudo-child",
        choreographyNumber: 4,
        experienceLevel: "nudo",
      }),
      row({
        choreographyId: "pre-elite-child",
        choreographyNumber: 5,
        experienceLevel: "pre_elite",
      }),
      row({
        choreographyId: "profesional-child",
        choreographyNumber: 6,
        experienceLevel: "profesional",
      }),
      row({
        choreographyId: "pro-am-child",
        choreographyNumber: 7,
        experienceLevel: "pro_am",
      }),
      row({ choreographyId: "no-level-child", choreographyNumber: 8 }),
    ];

    expect(orderOf(rows)).toEqual([
      "nudo-child",
      "nudo-teen",
      "amateur-child",
      "profesional-child",
      "pre-elite-child",
      "elite-child",
      "pro-am-child",
      "no-level-child",
    ]);
  });

  test("keeps the schedule as the outermost key, above the experience level", () => {
    const evening = {
      id: "s2",
      name: "Sala A",
      scheduledDate: "2026-05-01",
      startTime: "18:00",
    };
    const rows = [
      row({
        choreographyId: "evening-nudo",
        choreographyNumber: 1,
        experienceLevel: "nudo",
        schedule: evening,
      }),
      row({
        choreographyId: "morning-elite",
        choreographyNumber: 2,
        experienceLevel: "elite",
      }),
    ];

    expect(orderOf(rows)).toEqual(["morning-elite", "evening-nudo"]);
  });

  test("orders a schedule with no level at all exactly as before", () => {
    const rows = [
      row({
        choreographyId: "teen",
        choreographyNumber: 1,
        category: { maxAge: 100, minAge: 13, name: "Juvenil" },
      }),
      row({
        choreographyId: "child-duo",
        choreographyNumber: 2,
        groupType: "duo",
      }),
      row({ choreographyId: "child-solo", choreographyNumber: 3 }),
    ];

    expect(orderOf(rows)).toEqual(["child-solo", "child-duo", "teen"]);
  });

  test("keeps the age and group type order inside one experience level", () => {
    const teen = { maxAge: 100, minAge: 13, name: "Juvenil" };
    const rows = [
      row({
        choreographyId: "nudo-teen",
        choreographyNumber: 1,
        category: teen,
        experienceLevel: "nudo",
      }),
      row({
        choreographyId: "amateur-child",
        choreographyNumber: 2,
        experienceLevel: "amateur",
      }),
      row({
        choreographyId: "nudo-child-grupal",
        choreographyNumber: 3,
        experienceLevel: "nudo",
        groupType: "grupal",
      }),
      row({
        choreographyId: "nudo-child-duo",
        choreographyNumber: 4,
        experienceLevel: "nudo",
        groupType: "duo",
      }),
      row({
        choreographyId: "nudo-child-trio",
        choreographyNumber: 5,
        experienceLevel: "nudo",
        groupType: "trio",
      }),
      row({
        choreographyId: "nudo-child-solo",
        choreographyNumber: 6,
        experienceLevel: "nudo",
      }),
    ];

    expect(orderOf(rows)).toEqual([
      "nudo-child-solo",
      "nudo-child-duo",
      "nudo-child-trio",
      "nudo-child-grupal",
      "nudo-teen",
      "amateur-child",
    ]);
  });

  test("is deterministic under a shuffled input", () => {
    const rows = [
      row({
        choreographyId: "a",
        choreographyNumber: 1,
        activeDancerIds: ["ana"],
      }),
      row({ choreographyId: "b", choreographyNumber: 2 }),
      row({
        choreographyId: "c",
        choreographyNumber: 3,
        activeDancerIds: ["ana"],
      }),
      row({ choreographyId: "d", choreographyNumber: 4 }),
      row({
        choreographyId: "e",
        choreographyNumber: 5,
        category: { maxAge: 100, minAge: 13, name: "Juvenil" },
      }),
      row({ choreographyId: "f", choreographyNumber: 6 }),
    ];
    const expected = orderOf(rows);

    for (const seed of [1, 2, 3, 4, 5]) {
      expect(orderOf(shuffle(rows, seed))).toEqual(expected);
    }
  });

  describe("dancer spacing", () => {
    test("skips a row that shares a dancer with the previous four", () => {
      const rows = [
        row({
          choreographyId: "a",
          choreographyNumber: 1,
          activeDancerIds: ["ana"],
        }),
        row({
          choreographyId: "b",
          choreographyNumber: 2,
          activeDancerIds: ["ana"],
        }),
        row({ choreographyId: "c", choreographyNumber: 3 }),
        row({ choreographyId: "d", choreographyNumber: 4 }),
        row({ choreographyId: "e", choreographyNumber: 5 }),
        row({ choreographyId: "f", choreographyNumber: 6 }),
      ];

      expect(orderOf(rows)).toEqual(["a", "c", "d", "e", "f", "b"]);
    });

    test("ignores a dancer who is not active in the choreography", () => {
      const rows = [
        row({
          choreographyId: "a",
          choreographyNumber: 1,
          activeDancerIds: ["ana"],
        }),
        row({ choreographyId: "b", choreographyNumber: 2 }),
      ];

      expect(orderOf(rows)).toEqual(["a", "b"]);
    });

    test("places the lowest number when every remaining row conflicts", () => {
      const rows = [
        row({
          choreographyId: "a",
          choreographyNumber: 1,
          activeDancerIds: ["ana"],
        }),
        row({
          choreographyId: "c",
          choreographyNumber: 3,
          activeDancerIds: ["ana"],
        }),
        row({
          choreographyId: "b",
          choreographyNumber: 2,
          activeDancerIds: ["ana"],
        }),
      ];

      expect(orderOf(rows)).toEqual(["a", "b", "c"]);
    });

    test("carries the gap across the blocks of one schedule", () => {
      const rows = [
        row({
          choreographyId: "child",
          choreographyNumber: 1,
          activeDancerIds: ["ana"],
        }),
        row({
          choreographyId: "teen-shared",
          choreographyNumber: 2,
          activeDancerIds: ["ana"],
          category: { maxAge: 100, minAge: 13, name: "Juvenil" },
        }),
        row({
          choreographyId: "teen-free",
          choreographyNumber: 3,
          category: { maxAge: 100, minAge: 13, name: "Juvenil" },
        }),
      ];

      expect(orderOf(rows)).toEqual(["child", "teen-free", "teen-shared"]);
    });

    test("never moves a row out of its experience level block", () => {
      const rows = [
        row({
          choreographyId: "nudo-shared",
          choreographyNumber: 1,
          activeDancerIds: ["ana"],
          experienceLevel: "nudo",
        }),
        row({
          choreographyId: "nudo-other",
          choreographyNumber: 2,
          activeDancerIds: ["ana"],
          experienceLevel: "nudo",
        }),
        row({
          choreographyId: "amateur-free",
          choreographyNumber: 3,
          experienceLevel: "amateur",
        }),
      ];

      expect(orderOf(rows)).toEqual([
        "nudo-shared",
        "nudo-other",
        "amateur-free",
      ]);
    });

    test("starts the gap over at a new schedule", () => {
      const eveningSchedule = {
        id: "s2",
        name: "Sala A",
        scheduledDate: "2026-05-01",
        startTime: "18:00",
      };
      const rows = [
        row({
          choreographyId: "morning",
          choreographyNumber: 1,
          activeDancerIds: ["ana"],
        }),
        row({
          choreographyId: "evening-shared",
          choreographyNumber: 2,
          activeDancerIds: ["ana"],
          schedule: eveningSchedule,
        }),
        row({
          choreographyId: "evening-free",
          choreographyNumber: 3,
          schedule: eveningSchedule,
        }),
      ];

      expect(orderOf(rows)).toEqual([
        "morning",
        "evening-shared",
        "evening-free",
      ]);
    });
  });

  test("orders and counts a numbered choreography that fell below `Señada`", () => {
    const rows = [
      row({
        choreographyId: "below",
        choreographyNumber: 1,
        activeDancerIds: ["ana"],
        financialStatus: "depositPending",
        orderNumber: 7,
      }),
      row({
        choreographyId: "shares",
        choreographyNumber: 2,
        activeDancerIds: ["ana"],
      }),
      row({ choreographyId: "free", choreographyNumber: 3 }),
    ];

    expect(orderOf(rows)).toEqual(["below", "free", "shares"]);
  });
});

describe("movePosition", () => {
  test("moves a row down and keeps the rest contiguous", () => {
    expect(movePosition(["a", "b", "c", "d"], "a", 2)).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
  });

  test("moves a row up", () => {
    expect(movePosition(["a", "b", "c", "d"], "d", 1)).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
  });

  test("inserts an id that was not in the order", () => {
    expect(movePosition(["a", "b"], "late", 1)).toEqual(["a", "late", "b"]);
  });

  test("clamps a target beyond the ends of the order", () => {
    expect(movePosition(["a", "b"], "late", 99)).toEqual(["a", "b", "late"]);
    expect(movePosition(["a", "b"], "late", -3)).toEqual(["late", "a", "b"]);
  });
});

describe("findFrozenChoreographyIds", () => {
  test("freezes every numbered row of a schedule with an evaluated presentation", () => {
    const rows = [
      row({
        choreographyId: "scored",
        choreographyNumber: 1,
        orderNumber: 1,
        schedule: dayOne,
      }),
      row({
        choreographyId: "tail",
        choreographyNumber: 2,
        orderNumber: 2,
        schedule: dayOne,
      }),
      row({
        choreographyId: "late-day-one",
        choreographyNumber: 3,
        schedule: dayOne,
      }),
      row({
        choreographyId: "next-day",
        choreographyNumber: 4,
        orderNumber: 3,
        schedule: dayTwo,
      }),
    ];

    expect(findFrozenChoreographyIds(rows, new Set(["scored"]))).toEqual(
      new Set(["scored", "tail"]),
    );
  });

  test("freezes nothing while no presentation is evaluated", () => {
    const rows = [
      row({ choreographyId: "a", choreographyNumber: 1, orderNumber: 1 }),
    ];

    expect(findFrozenChoreographyIds(rows, new Set())).toEqual(new Set());
  });
});

describe("computeAutomaticOrder with frozen rows", () => {
  test("keeps the frozen numbers and fills the free positions in block order", () => {
    const rows = [
      row({
        choreographyId: "d1-b",
        choreographyNumber: 2,
        orderNumber: 2,
        schedule: dayOne,
      }),
      row({
        choreographyId: "d1-a",
        choreographyNumber: 1,
        orderNumber: 1,
        schedule: dayOne,
      }),
      row({
        choreographyId: "d2-b",
        choreographyNumber: 20,
        orderNumber: 3,
        schedule: dayTwo,
      }),
      row({
        choreographyId: "d2-a",
        choreographyNumber: 10,
        orderNumber: 4,
        schedule: dayTwo,
      }),
      row({
        choreographyId: "d2-late",
        choreographyNumber: 5,
        schedule: dayTwo,
      }),
    ];

    const result = computeAutomaticOrder(rows, new Set(["d1-a", "d1-b"]));

    expect(result).toEqual({
      ok: true,
      frozenCount: 2,
      placements: expect.arrayContaining([
        { choreographyId: "d2-late", orderNumber: 3 },
        { choreographyId: "d2-a", orderNumber: 4 },
        { choreographyId: "d2-b", orderNumber: 5 },
      ]),
    });
    expect(result.ok && result.placements).toHaveLength(3);
  });

  test("places a late row of a frozen schedule right after that schedule's run", () => {
    const rows = [
      row({
        choreographyId: "d1-a",
        choreographyNumber: 1,
        orderNumber: 1,
        schedule: dayOne,
      }),
      row({
        choreographyId: "d1-late",
        choreographyNumber: 9,
        schedule: dayOne,
      }),
      row({
        choreographyId: "d2-a",
        choreographyNumber: 2,
        orderNumber: 2,
        schedule: dayTwo,
      }),
    ];

    expect(placementsOf(rows, new Set(["d1-a"]))).toEqual([
      ["d1-late", 2],
      ["d2-a", 3],
    ]);
  });

  test("never inserts between two frozen schedules: the late row lands after both", () => {
    const rows = [
      row({
        choreographyId: "d1-a",
        choreographyNumber: 1,
        orderNumber: 1,
        schedule: dayOne,
      }),
      row({
        choreographyId: "d1-late",
        choreographyNumber: 9,
        schedule: dayOne,
      }),
      row({
        choreographyId: "d2-a",
        choreographyNumber: 2,
        orderNumber: 2,
        schedule: dayTwo,
      }),
      row({
        choreographyId: "d3-a",
        choreographyNumber: 3,
        orderNumber: 3,
        schedule: dayThree,
      }),
    ];

    expect(placementsOf(rows, new Set(["d1-a", "d2-a"]))).toEqual([
      ["d1-late", 3],
      ["d3-a", 4],
    ]);
  });

  test("leaves a gap inside a frozen run alone", () => {
    const rows = [
      row({
        choreographyId: "d1-a",
        choreographyNumber: 1,
        orderNumber: 1,
        schedule: dayOne,
      }),
      row({
        choreographyId: "d1-c",
        choreographyNumber: 3,
        orderNumber: 3,
        schedule: dayOne,
      }),
      row({
        choreographyId: "d2-a",
        choreographyNumber: 4,
        orderNumber: 7,
        schedule: dayTwo,
      }),
    ];

    expect(placementsOf(rows, new Set(["d1-a", "d1-c"]))).toEqual([
      ["d2-a", 4],
    ]);
  });

  test("leaves a gap between two frozen schedules alone as well", () => {
    const rows = [
      row({
        choreographyId: "d1-a",
        choreographyNumber: 1,
        orderNumber: 1,
        schedule: dayOne,
      }),
      row({
        choreographyId: "d2-a",
        choreographyNumber: 2,
        orderNumber: 4,
        schedule: dayTwo,
      }),
      row({
        choreographyId: "d3-a",
        choreographyNumber: 3,
        schedule: dayThree,
      }),
    ];

    expect(placementsOf(rows, new Set(["d1-a", "d2-a"]))).toEqual([
      ["d3-a", 5],
    ]);
  });

  test("counts the frozen tail of a schedule towards the dancer gap", () => {
    const rows = [
      row({
        choreographyId: "d1-a",
        choreographyNumber: 1,
        orderNumber: 1,
        schedule: dayOne,
        activeDancerIds: ["ana"],
      }),
      row({
        choreographyId: "d1-shares",
        choreographyNumber: 2,
        schedule: dayOne,
        activeDancerIds: ["ana"],
      }),
      row({
        choreographyId: "d1-free",
        choreographyNumber: 3,
        schedule: dayOne,
      }),
    ];

    expect(placementsOf(rows, new Set(["d1-a"]))).toEqual([
      ["d1-free", 2],
      ["d1-shares", 3],
    ]);
  });

  test("refuses when every candidate is frozen", () => {
    const rows = [
      row({
        choreographyId: "d1-a",
        choreographyNumber: 1,
        orderNumber: 1,
        schedule: dayOne,
      }),
      row({
        choreographyId: "below",
        choreographyNumber: 2,
        financialStatus: "depositPending",
        schedule: dayTwo,
      }),
    ];

    expect(computeAutomaticOrder(rows, new Set(["d1-a"]))).toEqual({
      ok: false,
      reason: "nothingToOrder",
    });
  });
});

describe("computeManualMove", () => {
  const numbered = [
    row({
      choreographyId: "d1-a",
      choreographyNumber: 1,
      orderNumber: 1,
      schedule: dayOne,
    }),
    row({
      choreographyId: "d1-b",
      choreographyNumber: 2,
      orderNumber: 2,
      schedule: dayOne,
    }),
    row({
      choreographyId: "d2-a",
      choreographyNumber: 3,
      orderNumber: 3,
      schedule: dayTwo,
    }),
    row({
      choreographyId: "d2-b",
      choreographyNumber: 4,
      orderNumber: 4,
      schedule: dayTwo,
    }),
    row({
      choreographyId: "d2-c",
      choreographyNumber: 5,
      orderNumber: 5,
      schedule: dayTwo,
    }),
  ];
  const frozen = new Set(["d1-a", "d1-b"]);

  test("refuses to move a frozen row", () => {
    expect(computeManualMove(numbered, frozen, "d1-b", 5)).toEqual({
      ok: false,
      reason: "frozenRow",
    });
  });

  test("refuses a frozen position as the target", () => {
    expect(computeManualMove(numbered, frozen, "d2-c", 2)).toEqual({
      ok: false,
      reason: "frozenPosition",
    });
  });

  test("refuses a frozen position past the last free one instead of clamping", () => {
    const frozenTail = new Set([...frozen, "d2-c"]);

    expect(computeManualMove(numbered, frozenTail, "d2-a", 5)).toEqual({
      ok: false,
      reason: "frozenPosition",
    });
  });

  test("permutes the free positions only", () => {
    const result = computeManualMove(numbered, frozen, "d2-c", 3);

    expect(result).toEqual({
      ok: true,
      movedToOrderNumber: 3,
      placements: expect.arrayContaining([
        { choreographyId: "d2-c", orderNumber: 3 },
        { choreographyId: "d2-a", orderNumber: 4 },
        { choreographyId: "d2-b", orderNumber: 5 },
      ]),
    });
  });

  test("places a late row at the end and closes gaps outside the frozen runs", () => {
    const withGap = [
      ...numbered.slice(0, 4),
      row({
        choreographyId: "d2-c",
        choreographyNumber: 5,
        orderNumber: 9,
        schedule: dayTwo,
      }),
    ];

    const result = computeManualMove(withGap, frozen, "late", 10);

    expect(result).toEqual({
      ok: true,
      movedToOrderNumber: 6,
      placements: expect.arrayContaining([
        { choreographyId: "d2-c", orderNumber: 5 },
        { choreographyId: "late", orderNumber: 6 },
      ]),
    });
  });

  test("moves freely when nothing is frozen", () => {
    const result = computeManualMove(numbered, new Set(), "d2-c", 1);

    expect(result.ok && result.movedToOrderNumber).toBe(1);
  });
});
