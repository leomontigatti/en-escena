import type {
  ChoreographyRegistrationOperationResolution,
  ResolvedRegistrationDancer,
} from "@/lib/choreographies/registration-resolution.server";
import type { ChoreographyListItem } from "@/lib/portal/choreographies";

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

export type DancerEditingBlockReason =
  | "presentation"
  | "active-financial-link"
  | "registration-closed";

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

export type UpdateChoreographyDancersResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
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
      options: [ChoreographyDancerScheduleOption];
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
      options: ChoreographyDancerScheduleOption[];
      selectedScheduleCapacityId: null;
    };

export type ChoreographyCategoryCalculationMode =
  ChoreographyRegistrationOperationResolution["categoryCalculationMode"];

export type ResolveChoreographyDancersResult =
  | {
      ok: true;
      resolution: {
        groupType: ChoreographyListItem["groupType"];
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
        hasActiveFinancialLink: boolean;
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

export const choreographyNotFoundMessage = "No encontramos esa Coreografía.";
export const invalidProfessorSelectionMessage =
  "Seleccioná solo Profesores activos o ya vinculados a esta Coreografía.";
export const invalidDancerSelectionMessage =
  "Seleccioná solo bailarines activos o ya vinculados a esta coreografía.";
export const invalidExperienceLevelMessage =
  "Elegí un nivel de experiencia válido para esta coreografía.";
export const compatibleScheduleSelectionRequiredMessage =
  "Elegí un Cupo de cronograma compatible para guardar los bailarines.";

type ResolvedChoreographyCategory = {
  id: string | null;
  name: string | null;
};

export function getDancerEditingEligibility(input: {
  hasActiveFinancialLink: boolean;
  hasPresentation: boolean;
  isRegistrationOpen: boolean;
}): DancerEditingEligibility {
  if (input.hasPresentation) {
    return {
      canEdit: false,
      reasonCode: "presentation",
      reasonText:
        "No podés editar los bailarines de esta coreografía porque ya tiene una presentación asociada.",
    };
  }

  if (input.hasActiveFinancialLink) {
    return {
      canEdit: false,
      reasonCode: "active-financial-link",
      reasonText:
        "No podés editar los bailarines de esta coreografía porque tiene un vínculo financiero activo.",
    };
  }

  if (!input.isRegistrationOpen) {
    return {
      canEdit: false,
      reasonCode: "registration-closed",
      reasonText:
        "No podés editar los bailarines de esta coreografía porque el período de inscripción está cerrado.",
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
