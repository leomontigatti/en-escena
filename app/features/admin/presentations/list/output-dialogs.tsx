import { MusicDownloadDialog } from "./music-download-dialog";
import { ProgramExportDialog } from "./program-export-dialog";
import type { PresentationListResult } from "./shared";
import { ResultsPrintDialog } from "../results-print/dialog";

/**
 * The program can be shown once something in it is numbered, and hidden
 * whenever it is visible, so it never gets stuck public.
 */
export function readProgramToggle(loaderData: PresentationListResult) {
  const { canOrder, hasPresentations, programVisible, selectedEventId } =
    loaderData;

  if (!canOrder || selectedEventId === null) {
    return null;
  }

  if (!programVisible && !hasPresentations) {
    return null;
  }

  return { eventId: selectedEventId, show: !programVisible };
}

/** The dialogs that hand something out of the list rather than change it. */
export type OutputDialog = "musicDownload" | "programExport" | "resultsPrint";

export function PresentationOutputDialog({
  dialog,
  loaderData,
  onClose,
}: {
  dialog: OutputDialog | null;
  loaderData: PresentationListResult;
  onClose: () => void;
}) {
  const onOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  if (dialog === "resultsPrint") {
    return (
      <ResultsPrintDialog
        open
        onOpenChange={onOpenChange}
        schedules={loaderData.printableSchedules}
      />
    );
  }

  if (dialog === "musicDownload") {
    return (
      <MusicDownloadDialog
        days={loaderData.musicDownloadDays}
        defaultDay={loaderData.filters.day}
        open
        onOpenChange={onOpenChange}
      />
    );
  }

  if (dialog === "programExport") {
    return (
      <ProgramExportDialog
        days={loaderData.programExportDays}
        open
        onOpenChange={onOpenChange}
      />
    );
  }

  return null;
}
