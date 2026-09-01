import type { EventDocumentDownloadUrls } from "@/lib/events/event-documents";
import type { PortalProfessorListItem } from "@/lib/portal/professors.server";

export type PortalProfessorsListLoaderData = {
  documentDownloadUrls: EventDocumentDownloadUrls;
  professors: PortalProfessorListItem[];
};
