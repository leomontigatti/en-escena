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
} from "@/lib/choreographies/choreography-roster.server";

export const choreographyResolutionErrorToastId =
  "choreography-resolution-error";
export const choreographyMusicUploadErrorToastId =
  "choreography-music-upload-error";
export const resolveChoreographyDancersIntent = "resolve-choreography-dancers";
export const updateChoreographyIntent = "update-choreography";
export const rosterEditorReviewMessage =
  "Revisá los bailarines de la coreografía.";
export const choreographyMusicAccept =
  "audio/mpeg,audio/mp4,audio/m4a,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg";
export const choreographyMusicAllowedMimeTypes = [
  "audio/aac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
  "audio/x-wav",
];
export const choreographyMusicMaxFileSizeBytes = 50 * 1024 * 1024;
export const choreographyMusicInvalidTypeMessage =
  "El archivo de música debe ser MP3, M4A, WAV u OGG.";
export const choreographyMusicMaxFileSizeMessage =
  "El archivo de música no puede superar 50 MB.";
export const choreographyMusicUploadErrorMessage =
  "No pudimos subir el archivo de música. Intentá nuevamente.";
export const choreographyMusicPresentationBlockedMessage =
  "No podés editar la música porque la coreografía ya tiene una presentación asociada.";

export const choreographyEditSchema = z.object({
  dancerIds: z.array(z.string().trim().min(1)).min(1, requiredFieldMessage),
  professorIds: z.array(z.string().trim().min(1)),
  experienceLevelId: z.string().trim().optional(),
  musicStorageKey: z.string().trim().optional(),
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

export type ChoreographyRosterEditorActionData =
  | {
      status: "update-error";
      section: "dancers";
      fieldErrors?: ChoreographyEditFieldErrors;
      message: string;
      selectedDancerIds: string[];
      selectedMusicStorageKey?: string;
      selectedProfessorIds: string[];
      selectedExperienceLevelId: string | null;
      selectedScheduleCapacityId?: string;
    }
  | {
      status: "update-error";
      section: "professors";
      message: string;
      selectedDancerIds: string[];
      selectedMusicStorageKey?: string;
      selectedProfessorIds: string[];
      selectedExperienceLevelId: string | null;
      selectedScheduleCapacityId?: string;
    }
  | {
      status: "update-error";
      section: "music";
      message: string;
      selectedDancerIds: string[];
      selectedMusicStorageKey?: string;
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
  musicStorageKey?: string | null;
  musicDownloadUrl?: string | null;
  scheduleCapacityId: string | null;
  scheduleLabel: string;
  dancers: ChoreographyDancer[];
  professors: ChoreographyProfessor[];
};

export type ChoreographyRosterEditorLoaderData = {
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

export type ChoreographyRosterEditorResolutionActionData =
  DancerResolutionActionData;
