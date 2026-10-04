import { useState } from "react";

import { DayExportDialog } from "@/features/admin/day-export/dialog";

import { MusicDownloadDialog } from "./music-download-dialog";
import { ProgramVisibilityDialog } from "./program-visibility-dialog";
import type { PresentationListResult } from "./shared";
import { programExportPath } from "../program-export/shared";

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

/**
 * The dialogs that hand something out of the list, or the program out of the
 * app, rather than change the list.
 */
export type OutputDialog =
  "musicDownload" | "programExport" | "programVisibility";

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

  if (dialog === "programVisibility") {
    return (
      <ProgramVisibilityFromList loaderData={loaderData} onClose={onClose} />
    );
  }

  if (dialog === "programExport") {
    return (
      <DayExportDialog
        days={loaderData.programExportDays}
        description="Elegí el día, o todos. Se descarga una planilla de Excel con las presentaciones en su orden."
        open
        onOpenChange={onOpenChange}
        path={programExportPath}
        title="Descargar programa"
      />
    );
  }

  return null;
}

/**
 * Reads which way the toggle goes once, when the dialog opens, so the
 * revalidation after the change does not flip the dialog before it closes.
 */
function ProgramVisibilityFromList({
  loaderData,
  onClose,
}: {
  loaderData: PresentationListResult;
  onClose: () => void;
}) {
  const [toggle] = useState(() => readProgramToggle(loaderData));

  if (!toggle) {
    return null;
  }

  return <ProgramVisibilityDialog {...toggle} onClose={onClose} />;
}
