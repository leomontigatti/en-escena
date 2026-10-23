import { describe, expect, test } from "vitest";

import {
  resolveChoreographyLocks,
  type ChoreographyLockActor,
  type ChoreographyLockReason,
} from "@/lib/choreographies/choreography-locks";

type Row = {
  actor: ChoreographyLockActor;
  isEvaluated: boolean;
  isWithdrawn: boolean;
  /** The reason closing each capability, `null` when it is open. */
  expected: {
    rename: ChoreographyLockReason | null;
    lockedChoreographyData: ChoreographyLockReason | null;
    pendingOperationalChoreographyData: ChoreographyLockReason | null;
    delete: ChoreographyLockReason | null;
  };
};

const open = {
  rename: null,
  lockedChoreographyData: null,
  pendingOperationalChoreographyData: null,
  delete: null,
};

const evaluated = {
  rename: null,
  lockedChoreographyData: "evaluated-presentation",
  pendingOperationalChoreographyData: "evaluated-presentation",
  delete: "evaluated-presentation",
} as const;

const withdrawn = {
  rename: "withdrawn",
  lockedChoreographyData: "withdrawn",
  pendingOperationalChoreographyData: "withdrawn",
  delete: "withdrawn",
} as const;

// A withdrawal deletes the presentation an evaluation would need, so the two
// facts never meet and the table has no row for both.
const rows: Row[] = [
  { actor: "admin", isEvaluated: false, isWithdrawn: false, expected: open },
  {
    actor: "admin",
    isEvaluated: true,
    isWithdrawn: false,
    expected: evaluated,
  },
  {
    actor: "admin",
    isEvaluated: false,
    isWithdrawn: true,
    expected: withdrawn,
  },
  {
    actor: "auditor",
    isEvaluated: false,
    isWithdrawn: false,
    expected: {
      rename: "role",
      lockedChoreographyData: "role",
      pendingOperationalChoreographyData: "role",
      delete: "role",
    },
  },
  {
    actor: "auditor",
    isEvaluated: true,
    isWithdrawn: false,
    expected: { ...evaluated, rename: "role" },
  },
  {
    actor: "auditor",
    isEvaluated: false,
    isWithdrawn: true,
    expected: withdrawn,
  },
  {
    actor: "academy",
    isEvaluated: false,
    isWithdrawn: false,
    expected: {
      rename: "role",
      lockedChoreographyData: "role",
      pendingOperationalChoreographyData: null,
      delete: "role",
    },
  },
  {
    actor: "academy",
    isEvaluated: true,
    isWithdrawn: false,
    expected: { ...evaluated, rename: "role" },
  },
  {
    actor: "academy",
    isEvaluated: false,
    isWithdrawn: true,
    expected: withdrawn,
  },
];

describe("choreography locks", () => {
  test.each(rows)(
    "$actor, evaluated: $isEvaluated, withdrawn: $isWithdrawn",
    ({ expected, ...input }) => {
      const locks = resolveChoreographyLocks(input);

      expect({
        rename: locks.rename.reason,
        lockedChoreographyData: locks.lockedChoreographyData.reason,
        pendingOperationalChoreographyData:
          locks.pendingOperationalChoreographyData.reason,
        delete: locks.delete.reason,
      }).toEqual(expected);
      expect(locks.rename.locked).toBe(expected.rename !== null);
      expect(locks.delete.locked).toBe(expected.delete !== null);
    },
  );
});
