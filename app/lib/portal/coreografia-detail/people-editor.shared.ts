import { z } from "zod";

import { requiredFieldMessage } from "@/lib/shared/forms";
import {
  type ChoreographyGroupType,
  type ChoreographyOperationalStatus,
} from "@/lib/portal/choreographies";
import type {
  ChoreographyDancerOption,
  ChoreographyProfessorOption,
  DancerEditingEligibility,
  ResolveChoreographyDancersResult,
} from "@/lib/portal/choreography-people.server";

export const choreographyResolutionErrorToastId =
  "coreografia-resolution-error";
export const resolveChoreographyDancersIntent = "resolve-choreography-dancers";
export const updateChoreographyIntent = "update-choreography";
export const rosterEditorReviewMessage =
  "Revisá los bailarines de la coreografía.";

export const choreographyEditSchema = z.object({
  dancerIds: z.array(z.string().trim().min(1)).min(1, requiredFieldMessage),
  professorIds: z.array(z.string().trim().min(1)),
  experienceLevelId: z.string().trim().optional(),
  scheduleCapacityId: z.string().trim().optional(),
});

export type ChoreographyEditValues = z.infer<typeof choreographyEditSchema>;
export type ChoreographyEditFieldErrors = {
  dancerIds?: string;
  experienceLevelId?: string;
  scheduleCapacityId?: string;
};

type DancerResolutionActionData = {
  intent: typeof resolveChoreographyDancersIntent;
  result: ResolveChoreographyDancersResult;
};

export type CoreografiaPeopleEditorActionData =
  | {
      status: "update-error";
      section: "dancers";
      fieldErrors?: ChoreographyEditFieldErrors;
      message: string;
      selectedDancerIds: string[];
      selectedProfessorIds: string[];
      selectedExperienceLevelId: string | null;
      selectedScheduleCapacityId?: string;
    }
  | {
      status: "update-error";
      section: "professors";
      message: string;
      selectedDancerIds: string[];
      selectedProfessorIds: string[];
      selectedExperienceLevelId: string | null;
      selectedScheduleCapacityId?: string;
    }
  | undefined;

type ChoreographyProfessor = ChoreographyProfessorOption;

type ChoreographyDancer = ChoreographyDancerOption & {
  ageAtEventStart: number | null;
};

type ChoreographySummary = {
  id: string;
  name: string;
  modalityName: string;
  submodalityName: string | null;
  hasPresentation?: boolean;
  groupType: ChoreographyGroupType;
  categoryId: string | null;
  categoryName: string | null;
  dancerEditingEligibility: DancerEditingEligibility;
  experienceLevelId: string | null;
  experienceLevelName: string | null;
  operationalStatus: ChoreographyOperationalStatus;
  scheduleCapacityId: string | null;
  scheduleLabel: string;
  dancers: ChoreographyDancer[];
  professors: ChoreographyProfessor[];
};

export type CoreografiaPeopleEditorLoaderData = {
  availableDancers: ChoreographyDancerOption[];
  availableProfessors: ChoreographyProfessorOption[];
  choreography: ChoreographySummary;
  dancerEditingEligibility: DancerEditingEligibility;
  eventContext: {
    isReadOnly: boolean;
  };
};

export type ResolvedDancerResolution = Extract<
  ResolveChoreographyDancersResult,
  { ok: true }
>["resolution"];

export type DancerResolutionState = {
  groupType: ChoreographySummary["groupType"];
  categoryId: ChoreographySummary["categoryId"];
  categoryName: ChoreographySummary["categoryName"];
  categoryCalculationMode:
    | ResolvedDancerResolution["categoryCalculationMode"]
    | null;
  categoryAgeBasis: ResolvedDancerResolution["categoryAgeBasis"] | null;
  experienceLevelRequired: boolean;
  experienceLevelOptions: Array<{
    id: string;
    name: string;
  }>;
};

export type CoreografiaPeopleEditorResolutionActionData =
  DancerResolutionActionData;
