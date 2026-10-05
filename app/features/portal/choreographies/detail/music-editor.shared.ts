import { z } from "zod";

import type { PortalChoreographyDetail } from "@/lib/portal/choreographies.server";
import type { PortalEventContext } from "@/lib/portal/event-context";

export const updateChoreographyIntent = "update-choreography";
export const choreographyMusicUploadErrorToastId =
  "choreography-music-upload-error";
export const choreographyMusicSavedToastId = "choreography-music-saved";
export const choreographyMusicUploadErrorMessage =
  "No pudimos subir el archivo de música. Intentá nuevamente.";

/**
 * The music form's one value: the stored song's key, empty once it is deleted.
 * The picked file travels beside it as `musicFile`, and its type and size are
 * the upload field's to check, as the storage policy the action applies again.
 */
export const choreographyMusicFormSchema = z.object({
  musicStorageKey: z.string(),
});

export type ChoreographyMusicFormValues = z.input<
  typeof choreographyMusicFormSchema
>;

export type PortalChoreographyMusicActionData =
  | {
      status: "update-error";
      message: string;
      selectedMusicStorageKey?: string;
    }
  | {
      status: "success";
      message: string;
    }
  // What `recoverableClientAction` returns when the submit fails unexpectedly.
  | {
      status: "error";
      message: string;
    }
  | undefined;

export type PortalChoreographyDetailChoreography = PortalChoreographyDetail & {
  musicDownloadUrl: string | null;
};

export type PortalChoreographyMusicLoaderData = {
  choreography: PortalChoreographyDetailChoreography;
  eventContext: PortalEventContext;
};
