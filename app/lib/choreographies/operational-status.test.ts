import { describe, expect, test } from "vitest";

import {
  deriveChoreographyOperationalStatus,
  formatChoreographyOperationalPendingItemLabel,
  formatChoreographyOperationalStatusLabel,
  getChoreographyOperationalStatusBadgeVariant,
} from "@/lib/choreographies/operational-status";

describe("choreography operational status", () => {
  test("derives labels and badge variants from shared operational semantics", () => {
    const completeStatus = deriveChoreographyOperationalStatus({
      categoryId: "category_1",
      experienceLevelId: "experience-level_1",
      hasMusic: true,
      hasProfessors: true,
      requiresExperienceLevel: true,
    });
    const incompleteStatus = deriveChoreographyOperationalStatus({
      categoryId: null,
      experienceLevelId: null,
      hasMusic: false,
      hasProfessors: false,
      requiresExperienceLevel: true,
    });

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
      pendingItems: ["music", "category", "professors"],
    });
    expect(incompleteStatus.pendingItems).not.toContain("experienceLevel");
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
});
