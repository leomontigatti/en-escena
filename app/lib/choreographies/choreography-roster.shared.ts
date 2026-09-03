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

export type DancerEditingBlockReason = "presentation";

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
 * `code: "schedule-capacity"` marks the two new guards on the capacity axis
 * (capacity lock, frozen-price guard): unlike the other dancers-section
 * failures, these are not swallowed behind the roster section's own error
 * channel — the route surfaces them as a plain `status: "error"` instead. See
 * `updateChoreographyRosterAction` in `server.ts`.
 */
export type UpdateChoreographyDancersResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      code?: "schedule-capacity";
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
      code?: "schedule-capacity";
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
        scheduleId: string | null;
        scheduleCapacityId: string | null;
        hasPresentation: boolean;
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
  hasPresentation: boolean;
}): DancerEditingEligibility {
  if (input.hasPresentation) {
    return {
      canEdit: false,
      reasonCode: "presentation",
      reasonText:
        "No podés editar los bailarines de esta coreografía porque ya tiene una presentación asociada.",
    };
  }

  return {
    canEdit: true,
    reasonCode: null,
    reasonText: null,
  };
}

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
