import { useState } from "react";

import { DayExportDialog } from "@/features/admin/day-export/dialog";

import { MusicDownloadDialog } from "./music-download-dialog";
import { ProgramVisibilityDialog } from "./program-visibility-dialog";
import type { PresentationListResult } from "./shared";
import { programExportPath } from "../program-export/shared";

/**
 * The days the visibility dialog lists, each with whether it is visible now:
 * the days with a numbered presentation, which can be shown, plus every day
 * visible now, so it can always be hidden and the program never gets stuck
 * public. `null` when there is no day to list.
 */
export function readProgramVisibilityDays(loaderData: PresentationListResult) {
  const { canOrder, programExportDays, programVisibleDays, selectedEventId } =
    loaderData;

  if (!canOrder || selectedEventId === null) {
    return null;
  }

  const days = [...new Set([...programExportDays, ...programVisibleDays])]
    .sort()
    .map((day) => ({ day, visible: programVisibleDays.includes(day) }));

  if (days.length === 0) {
    return null;
  }

  return { days, eventId: selectedEventId };
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
 * Reads the days and their state once, when the dialog opens, so the
 * revalidation after the save does not redraw the dialog before it closes.
 */
function ProgramVisibilityFromList({
  loaderData,
  onClose,
}: {
  loaderData: PresentationListResult;
  onClose: () => void;
}) {
  const [offer] = useState(() => readProgramVisibilityDays(loaderData));

  if (!offer) {
    return null;
  }

  return <ProgramVisibilityDialog {...offer} onClose={onClose} />;
}
