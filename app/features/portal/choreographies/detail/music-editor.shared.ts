import type { ChoreographyDetail } from "@/lib/portal/choreographies.server";
import type { PortalEventContext } from "@/lib/portal/event-context";

export const updateChoreographyIntent = "update-choreography";
export const choreographyMusicUploadErrorToastId =
  "choreography-music-upload-error";
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

export type PortalChoreographyMusicActionData =
  | {
      status: "update-error";
      message: string;
      selectedMusicStorageKey?: string;
    }
  | undefined;

export type PortalChoreographyDetailChoreography = ChoreographyDetail & {
  musicDownloadUrl: string | null;
};

export type PortalChoreographyMusicLoaderData = {
  choreography: PortalChoreographyDetailChoreography;
  eventContext: PortalEventContext;
};
