import { z } from "zod";

import {
  cleanFileNamePart,
  formatMusicFileLabel,
  formatMusicFileName,
  getMusicFileExtension,
} from "@/lib/presentations/music-file-name";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { slugify } from "@/lib/shared/slugify";

/**
 * What the day's music download and the dialog that starts it agree on: where
 * the download lives, the parameter the day travels in, and how the archive is
 * laid out: one file per presentation with music, named so the running order
 * reads off the file list, and a list of the ones still missing it.
 */

const musicDownloadPath = "/administracion/presentaciones/audios";
export const musicDownloadDayParam = "dia";

export const musicDownloadSchema = z.object({
  [musicDownloadDayParam]: z.string().min(1, requiredFieldMessage),
});

export type MusicDownloadFormValues = z.infer<typeof musicDownloadSchema>;

/**
 * A day with presentations, and whether any of them has music: the dialog
 * offers the first and turns down a day without the second before a download
 * is ever asked for.
 */
export type MusicDownloadDay = { day: string; hasMusic: boolean };

export function buildMusicDownloadHref(day: string) {
  const params = new URLSearchParams({ [musicDownloadDayParam]: day });

  return `${musicDownloadPath}?${params.toString()}`;
}

export type MusicArchiveSchedule = {
  id: string;
  name: string;
  startTime: string;
};

export type MusicArchiveRow = {
  academyName: string;
  musicStorageKey: string | null;
  name: string;
  orderNumber: number;
  scheduleId: string;
};

export type MusicArchivePlan = {
  fileName: string;
  files: Array<{ path: string; storageKey: string }>;
  /** `FALTANTES.txt`'s content, or `null` when every presentation has music. */
  missingList: string | null;
};

export const missingMusicListName = "FALTANTES.txt";

/**
 * Lays the day's archive out. `rows` come in running order and `schedules` in
 * time order, both narrowed to the day. Each file is named as a single
 * download names it (`formatMusicFileName`).
 */
export function planMusicArchive(input: {
  day: string;
  eventName: string;
  highestOrderNumber: number;
  rows: readonly MusicArchiveRow[];
  schedules: readonly MusicArchiveSchedule[];
}): MusicArchivePlan {
  // A day with one schedule needs no folder: there is nothing to tell apart.
  const foldersBySchedule = new Map(
    input.schedules.map((schedule) => [
      schedule.id,
      input.schedules.length > 1 ? formatScheduleFolder(schedule) : null,
    ]),
  );
  const files: MusicArchivePlan["files"] = [];
  const missingBySchedule = new Map<string, string[]>();

  for (const row of input.rows) {
    const label = formatMusicFileLabel({
      academyName: row.academyName,
      choreographyName: row.name,
    });

    if (row.musicStorageKey === null) {
      const missing = missingBySchedule.get(row.scheduleId) ?? [];

      missing.push(`N.º ${row.orderNumber} - ${label}`);
      missingBySchedule.set(row.scheduleId, missing);
      continue;
    }

    const folder = foldersBySchedule.get(row.scheduleId);
    const fileName = formatMusicFileName({
      academyName: row.academyName,
      choreographyName: row.name,
      extension: getMusicFileExtension(row.musicStorageKey),
      order: {
        highestOrderNumber: input.highestOrderNumber,
        orderNumber: row.orderNumber,
      },
    });

    files.push({
      path: folder ? `${folder}/${fileName}` : fileName,
      storageKey: row.musicStorageKey,
    });
  }

  return {
    fileName: `audios-${slugify(input.eventName)}-${input.day}.zip`,
    files,
    missingList:
      missingBySchedule.size === 0
        ? null
        : formatMissingList(input.schedules, missingBySchedule),
  };
}

function formatMissingList(
  schedules: readonly MusicArchiveSchedule[],
  missingBySchedule: ReadonlyMap<string, string[]>,
) {
  const lines = ["Presentaciones sin audio cargado", ""];

  for (const schedule of schedules) {
    const missing = missingBySchedule.get(schedule.id);

    if (!missing) {
      continue;
    }

    if (schedules.length > 1) {
      lines.push(formatScheduleFolder(schedule));
    }

    lines.push(...missing, "");
  }

  // CRLF, so the list reads right in Notepad on the sound desk's laptop too.
  return lines.join("\r\n");
}

/** `10:00` reads `10.00`: a colon is no file name on Windows. */
function formatScheduleFolder(schedule: MusicArchiveSchedule) {
  return `${schedule.startTime.slice(0, 5).replace(":", ".")} - ${cleanFileNamePart(schedule.name)}`;
}
