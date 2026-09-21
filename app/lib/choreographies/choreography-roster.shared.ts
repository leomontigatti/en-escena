import { evaluatedChoreographyMessage } from "@/lib/choreographies/choreography-messages";
import type {
  ChoreographyRegistrationOperationResolution,
  ResolvedRegistrationDancer,
} from "@/lib/choreographies/registration-resolution.server";
import type { PortalChoreographyListItem } from "@/lib/portal/choreographies";

export type ChoreographyProfessorOption = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
};

export type ChoreographyDancerOption = {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
};

export type DancerEditingBlockReason = "evaluated";

export type DancerEditingEligibility =
  | {
      canEdit: true;
      reasonCode: null;
      reasonText: null;
    }
  | {
      canEdit: false;
      reasonCode: DancerEditingBlockReason;
      reasonText: string;
    };

export type UpdateChoreographyProfessorsResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
    };

/**
 * `code` marks the dancers-section failures that must reach the page: the two
 * guards on the capacity axis (capacity lock, price-divergence guard) and the
 * refusal of a roster that resolves to no category. Unlike the other
 * dancers-section failures, they are not swallowed behind the roster section's
 * own error channel — the route surfaces them as a plain `status: "error"`
 * instead. Visibility is decided by code, not by the failure being a roster
 * failure. See `updateChoreographyRosterAction` in `server.ts`.
 */
export type ChoreographyRosterFailureCode =
  "schedule-capacity" | "no-compatible-category";

export type UpdateChoreographyDancersResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      code?: ChoreographyRosterFailureCode;
      fieldErrors?: {
        experienceLevelId?: string;
        scheduleCapacityId?: string;
      };
    };

export type UpdateChoreographyResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      section: "dancers" | "professors";
      code?: ChoreographyRosterFailureCode;
      fieldErrors?: {
        experienceLevelId?: string;
        scheduleCapacityId?: string;
      };
    };

export type ChoreographyDancerScheduleOption =
  ChoreographyRegistrationOperationResolution["schedule"] extends {
    options: infer TOptions;
  }
    ? TOptions extends Array<infer TOption>
      ? TOption
      : never
    : never;

/**
 * The labelled option: only the "multiple" resolution builds labels carrying the
 * occupancy, so it is the only one that can feed the shared select builder.
 * `ChoreographyDancerScheduleOption` flattens every variant and loses
 * `label`/`isFull`; this one keeps them.
 */
export type ChoreographyDancerScheduleChoice = Extract<
  ChoreographyRegistrationOperationResolution["schedule"],
  { status: "multiple" }
>["options"][number];

export type ChoreographyDancerScheduleResolution =
  | {
      status: "none";
      canSave: false;
      error: string;
      options: [];
      selectedScheduleCapacityId: null;
    }
  | {
      status: "keep-current";
      canSave: true;
      // Same criterion as the standalone path (`resolveScheduleCapacityCandidates`):
      // the assigned capacity is still compatible, but the select offers the full
      // compatible set, not just the assigned one.
      options: ChoreographyDancerScheduleOption[];
      selectedScheduleCapacityId: string;
    }
  | {
      status: "auto";
      canSave: true;
      options: [ChoreographyDancerScheduleOption];
      selectedScheduleCapacityId: string;
    }
  | {
      status: "multiple";
      canSave: true;
      options: ChoreographyDancerScheduleChoice[];
      selectedScheduleCapacityId: null;
    };

export type ChoreographyCategoryCalculationMode =
  ChoreographyRegistrationOperationResolution["categoryCalculationMode"];

export type ResolveChoreographyDancersResult =
  | {
      ok: true;
      resolution: {
        groupType: PortalChoreographyListItem["groupType"];
        categoryId: string | null;
        categoryName: string | null;
        categoryCalculationMode?: ChoreographyCategoryCalculationMode;
        categoryAgeBasis?: ChoreographyRegistrationOperationResolution["categoryAgeBasis"];
        experienceLevel: {
          required: boolean;
          options: Array<{
            id: string;
            name: string;
          }>;
        };
        schedule: ChoreographyDancerScheduleResolution;
      };
    }
  | {
      ok: false;
      message: string;
    };

export type ResolvedChoreographyDancerUpdateContext =
  | {
      ok: true;
      choreography: {
        id: string;
        modalityId: string;
        submodalityId: string | null;
        categoryId: string | null;
        experienceLevelId: string | null;
        scheduleId: string;
        scheduleCapacityId: string | null;
      };
      resolvedDancers: ResolvedRegistrationDancer[];
      resolution: ChoreographyRegistrationOperationResolution;
      scheduleResolution: ChoreographyDancerScheduleResolution;
    }
  | {
      ok: false;
      message: string;
      fieldErrors?: {
        experienceLevelId?: string;
      };
    };

export const invalidProfessorSelectionMessage =
  "Seleccioná solo profesores activos o ya vinculados a esta coreografía.";
export const invalidDancerSelectionMessage =
  "Seleccioná solo bailarines activos o ya vinculados a esta coreografía.";
export const compatibleScheduleSelectionRequiredMessage =
  "Elegí un cupo de cronograma compatible para guardar los bailarines.";

type ResolvedChoreographyCategory = {
  id: string | null;
  name: string | null;
};

export function getDancerEditingEligibility(input: {
  isEvaluated: boolean;
}): DancerEditingEligibility {
  if (input.isEvaluated) {
    return {
      canEdit: false,
      reasonCode: "evaluated",
      // The evaluated lock speaks with one sentence everywhere, roster
      // included: the choreography is closed as a whole, not field by field.
      reasonText: evaluatedChoreographyMessage,
    };
  }

  return {
    canEdit: true,
    reasonCode: null,
    reasonText: null,
  };
}

/**
 * The category of a resolution as the roster form reads it, which is the only
 * thing left that may report none: a saved choreography always has a category,
 * and every writer refuses the pending resolution before it reaches the column.
 * What this still answers is the *draft* the academy is editing, where a roster
 * that fits no category is exactly what the client blocks the save on.
 */
export function getResolvedChoreographyCategory(
  resolution: ChoreographyRegistrationOperationResolution,
): ResolvedChoreographyCategory {
  if (resolution.category.status !== "resolved") {
    return {
      id: null,
      name: null,
    };
  }

  return {
    id: resolution.category.id,
    name: resolution.category.name,
  };
}

export function getGlobalScheduleCapacityOptionId(scheduleId: string) {
  return `schedule:${scheduleId}:global`;
}

export function haveSameIds(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftSet = new Set(left);

  return right.every((id) => leftSet.has(id));
}
