import type { PortalChoreographyDetail } from "@/lib/portal/choreographies.server";
import type { PortalEventContext } from "@/lib/portal/event-context";

export const updateChoreographyIntent = "update-choreography";
export const choreographyMusicUploadErrorToastId =
  "choreography-music-upload-error";
export const choreographyMusicSavedToastId = "choreography-music-saved";
export const choreographyMusicUploadErrorMessage =
  "No pudimos subir el archivo de música. Intentá nuevamente.";
export const choreographyMusicPresentationBlockedMessage =
  "No podés editar la música porque la coreografía ya tiene una presentación asociada.";

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
  | undefined;

export type PortalChoreographyDetailChoreography = PortalChoreographyDetail & {
  musicDownloadUrl: string | null;
};

export type PortalChoreographyMusicLoaderData = {
  choreography: PortalChoreographyDetailChoreography;
  eventContext: PortalEventContext;
};
