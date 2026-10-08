import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  events,
  finalistPicks,
  modalities,
  scheduleModalities,
  schedules,
  user,
} from "@/db/schema";
import { grandFinalEligibility } from "@/lib/grand-final/eligibility.server";
import { readEventJudges } from "@/lib/grand-final/event-judges.server";
import { judgingDate } from "@/lib/judging/judging-day";

/**
 * A judge's `finalistPick`: one academy eligible in one modality of the active
 * event, chosen from the judge's own list. See CONTEXT.md `finalistPick`.
 *
 * The save follows the window of a score (`judgingDay`): it is open while one
 * of the modality's schedules is on the judging day, until 03:00 the next
 * morning, and refused on any other day. Eligibility is derived on read, so
 * the save reads it again rather than trusting the options the list showed:
 * a withdrawal since the page loaded refuses the academy it took out.
 */

export type FinalistPickRefusal =
  "closed" | "not-eligible" | "not-found" | "not-started";

export type SaveFinalistPickResult =
  { ok: true } | { ok: false; reason: FinalistPickRefusal };

/** Which academy a judge picks in which modality. */
type FinalistPickInput = {
  academyId: string;
  judgeId: string;
  modalityId: string;
};

export async function saveFinalistPick(
  input: FinalistPickInput & { now?: Date },
): Promise<SaveFinalistPickResult> {
  return await writeFinalistPick(input, () =>
    readPickWindowClosure(input.modalityId, input.now),
  );
}

export type SetFinalistPickResult =
  { ok: true } | { ok: false; reason: "not-eligible" | "not-found" };

/**
 * Administration's write of any judge's `finalistPick`, from the `Gran final`
 * list. It is the judge's save without the window: the same row, upserted,
 * and the same refusal of an academy not eligible in the modality. The judge
 * must be a judge user and one of the event's (`readEventJudges`), the ones
 * the list offers, so a pick never lands on another role or makes a judge
 * from another event one of this event's.
 */
export async function setFinalistPick(
  input: FinalistPickInput,
): Promise<SetFinalistPickResult> {
  const [judge] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, input.judgeId), eq(user.role, "judge")));
  const [modality] = await db
    .select({ eventId: modalities.eventId })
    .from(modalities)
    .where(eq(modalities.id, input.modalityId));
  const eventJudges = modality ? await readEventJudges(modality.eventId) : [];

  if (!judge || !eventJudges.some((entry) => entry.id === input.judgeId)) {
    return { ok: false, reason: "not-found" };
  }

  return await writeFinalistPick<never>(input, async () => null);
}

/**
 * The write both saves share: the modality in the active event, then the
 * caller's window, then eligibility read again, then the upsert of the one row
 * per judge per modality.
 */
async function writeFinalistPick<TClosure extends "closed" | "not-started">(
  input: FinalistPickInput,
  readClosure: () => Promise<TClosure | null>,
): Promise<
  { ok: true } | { ok: false; reason: TClosure | "not-eligible" | "not-found" }
> {
  const [modality] = await db
    .select({ eventId: modalities.eventId })
    .from(modalities)
    .innerJoin(events, eq(events.id, modalities.eventId))
    .where(and(eq(modalities.id, input.modalityId), events.active));

  if (!modality) {
    return { ok: false, reason: "not-found" };
  }

  const closure = await readClosure();

  if (closure) {
    return { ok: false, reason: closure };
  }

  const eligible = await grandFinalEligibility(modality.eventId);

  if (
    !eligible.some(
      (pair) =>
        pair.academyId === input.academyId &&
        pair.modalityId === input.modalityId,
    )
  ) {
    return { ok: false, reason: "not-eligible" };
  }

  await db
    .insert(finalistPicks)
    .values({
      academyId: input.academyId,
      eventId: modality.eventId,
      judgeId: input.judgeId,
      modalityId: input.modalityId,
    })
    .onConflictDoUpdate({
      target: [
        finalistPicks.eventId,
        finalistPicks.judgeId,
        finalistPicks.modalityId,
      ],
      set: { academyId: input.academyId, updatedAt: sql`CURRENT_TIMESTAMP` },
    });

  return { ok: true };
}

/**
 * Null while one of the modality's schedules is on the judging day, and
 * otherwise which side of it the save fell on: a modality still to dance has
 * not started, and one whose days are all behind, or that has none, is closed.
 */
async function readPickWindowClosure(
  modalityId: string,
  now: Date = new Date(),
): Promise<"closed" | "not-started" | null> {
  const today = judgingDate(now);
  const days = await readModalityDays(modalityId);

  if (days.includes(today)) {
    return null;
  }

  return days.some((day) => day > today) ? "not-started" : "closed";
}

async function readModalityDays(modalityId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ scheduledDate: schedules.scheduledDate })
    .from(scheduleModalities)
    .innerJoin(schedules, eq(schedules.id, scheduleModalities.scheduleId))
    .where(eq(scheduleModalities.modalityId, modalityId));

  return rows.map((row) => row.scheduledDate);
}

/** One academy the judge can pick in a modality. */
export type FinalistPickOption = { academyId: string; name: string };

/** One modality of the day, as the judge's list shows its pick. */
export type JudgeFinalistPickRow = {
  /** The judge's own pick, or null when they have made none. */
  academyId: string | null;
  /**
   * The picked academy's name, kept apart from `options` so a pick whose
   * academy stopped being eligible still reads as what was picked.
   */
  academyName: string | null;
  modalityId: string;
  modalityName: string;
  /** The academies eligible in the modality, by name. */
  options: FinalistPickOption[];
};

/**
 * The modalities of the active event that dance on `scheduledDate`, by name,
 * each with the academies eligible in it and the judge's own pick. Another
 * judge's pick never comes back. Whether the day is open for writing is the
 * caller's, as for the presentations of the list.
 */
export async function readJudgeFinalistPicks(input: {
  judgeId: string;
  /** The schedule date to read, as a `YYYY-MM-DD` business date. */
  scheduledDate: string;
}): Promise<JudgeFinalistPickRow[]> {
  const dayModalities = await db
    .selectDistinct({
      eventId: modalities.eventId,
      modalityId: modalities.id,
      modalityName: modalities.name,
    })
    .from(scheduleModalities)
    .innerJoin(schedules, eq(schedules.id, scheduleModalities.scheduleId))
    .innerJoin(modalities, eq(modalities.id, scheduleModalities.modalityId))
    .innerJoin(events, eq(events.id, modalities.eventId))
    .where(and(eq(schedules.scheduledDate, input.scheduledDate), events.active))
    .orderBy(asc(modalities.name));

  const [event] = dayModalities;

  if (!event) {
    return [];
  }

  const modalityIds = dayModalities.map((row) => row.modalityId);
  const eligible = (await grandFinalEligibility(event.eventId)).filter((pair) =>
    modalityIds.includes(pair.modalityId),
  );
  const picks = await db
    .select({
      academyId: finalistPicks.academyId,
      academyName: academies.name,
      modalityId: finalistPicks.modalityId,
    })
    .from(finalistPicks)
    .innerJoin(academies, eq(academies.id, finalistPicks.academyId))
    .where(
      and(
        eq(finalistPicks.judgeId, input.judgeId),
        inArray(finalistPicks.modalityId, modalityIds),
      ),
    );
  const names = await readAcademyNames(eligible.map((pair) => pair.academyId));

  return dayModalities.map((row) => {
    const pick = picks.find((entry) => entry.modalityId === row.modalityId);

    return {
      academyId: pick?.academyId ?? null,
      academyName: pick?.academyName ?? null,
      modalityId: row.modalityId,
      modalityName: row.modalityName,
      options: eligible
        .filter((pair) => pair.modalityId === row.modalityId)
        .map((pair) => ({
          academyId: pair.academyId,
          name: names.get(pair.academyId) ?? "",
        }))
        .sort((left, right) => left.name.localeCompare(right.name, "es")),
    };
  });
}

/** The names of the given academies, by id; a repeated id is read once. */
export async function readAcademyNames(
  academyIds: string[],
): Promise<Map<string, string>> {
  if (academyIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ id: academies.id, name: academies.name })
    .from(academies)
    .where(inArray(academies.id, [...new Set(academyIds)]));

  return new Map(rows.map((row) => [row.id, row.name]));
}
