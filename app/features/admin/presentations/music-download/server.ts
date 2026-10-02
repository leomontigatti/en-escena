import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { and, asc, eq } from "drizzle-orm";
import { ZipFile } from "yazl";

import { db } from "@/db";
import {
  academies,
  choreographies,
  events,
  presentations,
  schedules,
} from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import { getAssetKindPolicy } from "@/lib/storage/asset-kinds";
import {
  fsLocateObject,
  getDefaultStorageVolumeDir,
} from "@/lib/storage/filesystem-client.server";

import {
  missingMusicListName,
  musicDownloadDayParam,
  planMusicArchive,
  type MusicArchiveRow,
  type MusicArchiveSchedule,
  type MusicDownloadDay,
} from "./shared";

/**
 * The day's music, zipped for the sound desk: every presentation of the day
 * with its music file, named by its running order. See
 * `planMusicArchive` for the archive's layout.
 */

type EventMusicRow = MusicArchiveRow & {
  schedule: MusicArchiveSchedule & { scheduledDate: string };
};

/**
 * Every presentation of the event, in running order, with its music key and
 * its schedule. A withdrawn choreography is left out, as the program leaves it.
 */
async function readEventMusicRows(
  eventId: string,
  executor: Executor = db,
): Promise<EventMusicRow[]> {
  const rows = await executor
    .select({
      academyName: academies.name,
      musicStorageKey: choreographies.musicStorageKey,
      name: choreographies.name,
      orderNumber: presentations.orderNumber,
      scheduleId: schedules.id,
      scheduleName: schedules.name,
      scheduledDate: schedules.scheduledDate,
      startTime: schedules.startTime,
    })
    .from(presentations)
    .innerJoin(
      choreographies,
      eq(presentations.choreographyId, choreographies.id),
    )
    .innerJoin(academies, eq(choreographies.academyId, academies.id))
    .innerJoin(schedules, eq(choreographies.scheduleId, schedules.id))
    .where(and(eq(presentations.eventId, eventId), notWithdrawnChoreography()))
    .orderBy(asc(presentations.orderNumber));

  return rows.map((row) => ({
    academyName: row.academyName,
    musicStorageKey: row.musicStorageKey,
    name: row.name,
    orderNumber: row.orderNumber,
    schedule: {
      id: row.scheduleId,
      name: row.scheduleName,
      scheduledDate: row.scheduledDate,
      startTime: row.startTime,
    },
    scheduleId: row.scheduleId,
  }));
}

/** The days the download dialog offers, each saying whether it has music. */
export async function readMusicDownloadDays(
  eventId: string,
  executor: Executor = db,
): Promise<MusicDownloadDay[]> {
  const days = new Map<string, boolean>();

  for (const row of await readEventMusicRows(eventId, executor)) {
    const day = row.schedule.scheduledDate;

    days.set(day, (days.get(day) ?? false) || row.musicStorageKey !== null);
  }

  return [...days.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, hasMusic]) => ({ day, hasMusic }));
}

export async function loadMusicDownload(
  request: Request,
  deps: { baseDir?: string } = {},
): Promise<Response> {
  await requireInternalUser(request, ["admin"]);
  const { selectedEventId } = await loadEventContext(request);
  const day = new URL(request.url).searchParams.get(musicDownloadDayParam);

  if (selectedEventId === null || !day) {
    throw new Response("Día no encontrado", { status: 404 });
  }

  const baseDir = deps.baseDir ?? getDefaultStorageVolumeDir();
  const { bucket } = getAssetKindPolicy("choreographyMusic");
  const [[event], eventRows] = await Promise.all([
    db
      .select({ name: events.name })
      .from(events)
      .where(eq(events.id, selectedEventId)),
    readEventMusicRows(selectedEventId),
  ]);
  const dayRows = eventRows.filter((row) => row.schedule.scheduledDate === day);

  if (!event || dayRows.length === 0) {
    throw new Response("Día no encontrado", { status: 404 });
  }

  // A key whose file is not on the volume is music the archive cannot carry:
  // it is listed as missing rather than breaking the archive halfway through.
  const pathByKey = new Map<string, string>();
  const rows = await Promise.all(
    dayRows.map(async (row) => {
      if (row.musicStorageKey === null) {
        return row;
      }

      const path = await fsLocateObject({
        baseDir,
        bucket,
        key: row.musicStorageKey,
      });

      if (path === null) {
        return { ...row, musicStorageKey: null };
      }

      pathByKey.set(row.musicStorageKey, path);

      return row;
    }),
  );
  const daySchedules = [
    ...new Map(rows.map((row) => [row.schedule.id, row.schedule])).values(),
  ].sort((left, right) => left.startTime.localeCompare(right.startTime));
  const plan = planMusicArchive({
    day,
    eventName: event.name,
    highestOrderNumber: Math.max(...eventRows.map((row) => row.orderNumber)),
    rows,
    schedules: daySchedules,
  });

  if (plan.files.length === 0) {
    throw new Response("Ningún audio cargado para ese día", { status: 404 });
  }

  const zip = new ZipFile();

  // Stored, not deflated: audio barely shrinks, and the bytes stream straight
  // off the volume instead of the whole day sitting in memory.
  for (const file of plan.files) {
    zip.addReadStream(
      createReadStream(pathByKey.get(file.storageKey) ?? ""),
      file.path,
      { compress: false },
    );
  }

  if (plan.missingList !== null) {
    zip.addBuffer(Buffer.from(plan.missingList), missingMusicListName);
  }

  zip.end();

  return new Response(
    Readable.toWeb(zip.outputStream as Readable) as ReadableStream,
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${plan.fileName}"`,
        "Content-Type": "application/zip",
      },
    },
  );
}
