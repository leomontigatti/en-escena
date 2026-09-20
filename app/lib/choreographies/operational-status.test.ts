import { describe, expect, test } from "vitest";

import {
  deriveChoreographyOperationalStatus,
  formatChoreographyOperationalPendingItemLabel,
  formatChoreographyOperationalStatusLabel,
  getChoreographyOperationalStatusBadgeVariant,
} from "@/lib/choreographies/operational-status";

type StatusInput = Parameters<typeof deriveChoreographyOperationalStatus>[0];

function buildStatusInput(overrides: Partial<StatusInput> = {}): StatusInput {
  return {
    categoryExperienceLevels: ["amateur"],
    experienceLevelId: "amateur",
    hasMusic: true,
    hasProfessors: true,
    placementCheck: {
      categoryAgeBasis: 13,
      categoryMaxAge: 17,
      categoryMinAge: 12,
    },
    ...overrides,
  };
}

describe("choreography operational status", () => {
  test("derives labels and badge variants from shared operational semantics", () => {
    const completeStatus =
      deriveChoreographyOperationalStatus(buildStatusInput());
    const incompleteStatus = deriveChoreographyOperationalStatus(
      buildStatusInput({
        experienceLevelId: null,
        hasMusic: false,
        hasProfessors: false,
      }),
    );

    expect(completeStatus).toEqual({
      code: "complete",
      pendingItems: [],
    });
    expect(formatChoreographyOperationalStatusLabel(completeStatus)).toBe(
      "Completa",
    );
    expect(getChoreographyOperationalStatusBadgeVariant(completeStatus)).toBe(
      "success",
    );

    expect(incompleteStatus).toEqual({
      code: "incomplete",
      pendingItems: ["music", "experienceLevel", "professors"],
    });
    expect(formatChoreographyOperationalStatusLabel(incompleteStatus)).toBe(
      "Incompleta",
    );
    expect(
      formatChoreographyOperationalPendingItemLabel("experienceLevel"),
    ).toBe("Nivel de experiencia");
    expect(getChoreographyOperationalStatusBadgeVariant(incompleteStatus)).toBe(
      "warning",
    );
  });

  test("reports a stored age the category no longer contains", () => {
    const belowRange = deriveChoreographyOperationalStatus(
      buildStatusInput({
        placementCheck: {
          categoryAgeBasis: 11,
          categoryMaxAge: 17,
          categoryMinAge: 12,
        },
      }),
    );
    const aboveRange = deriveChoreographyOperationalStatus(
      buildStatusInput({
        placementCheck: {
          categoryAgeBasis: 18,
          categoryMaxAge: 17,
          categoryMinAge: 12,
        },
      }),
    );

    expect(belowRange).toEqual({
      code: "incomplete",
      pendingItems: ["categoryAgeMismatch"],
    });
    expect(aboveRange.pendingItems).toEqual(["categoryAgeMismatch"]);
    expect(
      formatChoreographyOperationalPendingItemLabel("categoryAgeMismatch"),
    ).toBe("Categoría fuera del rango de edad");
  });

  test("keeps a choreography the category still contains out of the fix list", () => {
    const atBounds = [12, 17].map((categoryAgeBasis) =>
      deriveChoreographyOperationalStatus(
        buildStatusInput({
          placementCheck: {
            categoryAgeBasis,
            categoryMaxAge: 17,
            categoryMinAge: 12,
          },
        }),
      ),
    );

    expect(atBounds.map((status) => status.code)).toEqual([
      "complete",
      "complete",
    ]);
  });

  // The group-tolerance branch files a choreography without a stored age and
  // without requiring containment, so there is nothing to re-check.
  test("stays silent when no age was stored for the placement", () => {
    const status = deriveChoreographyOperationalStatus(
      buildStatusInput({
        placementCheck: {
          categoryAgeBasis: null,
          categoryMaxAge: 17,
          categoryMinAge: 12,
        },
      }),
    );

    expect(status).toEqual({ code: "complete", pendingItems: [] });
  });

  test("reports a stored level the category no longer admits", () => {
    const strayLevel = deriveChoreographyOperationalStatus(
      buildStatusInput({
        categoryExperienceLevels: ["profesional"],
        experienceLevelId: "amateur",
      }),
    );
    const levelsDropped = deriveChoreographyOperationalStatus(
      buildStatusInput({
        categoryExperienceLevels: [],
        experienceLevelId: "amateur",
      }),
    );

    expect(strayLevel).toEqual({
      code: "incomplete",
      pendingItems: ["experienceLevelMismatch"],
    });
    expect(levelsDropped.pendingItems).toEqual(["experienceLevelMismatch"]);
    expect(
      formatChoreographyOperationalPendingItemLabel("experienceLevelMismatch"),
    ).toBe("Nivel de experiencia ajeno a la categoría");
  });

  // A missing level and a stray one are different states: a category that
  // declares no level asks for none, so an empty level is not pending there.
  test("asks for no level when the category declares none", () => {
    const status = deriveChoreographyOperationalStatus(
      buildStatusInput({
        categoryExperienceLevels: [],
        experienceLevelId: null,
      }),
    );

    expect(status).toEqual({ code: "complete", pendingItems: [] });
  });

  test("re-checks the placement only for the surfaces that can fix it", () => {
    const status = deriveChoreographyOperationalStatus(
      buildStatusInput({
        categoryExperienceLevels: ["profesional"],
        experienceLevelId: "amateur",
        placementCheck: null,
      }),
    );

    expect(status).toEqual({ code: "complete", pendingItems: [] });
  });
});
