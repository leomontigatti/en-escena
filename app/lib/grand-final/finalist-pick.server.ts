import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";

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
import { lockEvent } from "@/lib/grand-final/result.server";
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

export type SetAcademyFinalistPicksResult =
  { ok: true } | { ok: false; reason: "not-eligible" | "not-found" };

/** The judges who are to pick the academy in one modality, none included. */
export type AcademyModalityPicks = {
  judgeIds: readonly string[];
  modalityId: string;
};

type AcademyFinalistPicksInput = {
  academyId: string;
  picks: readonly AcademyModalityPicks[];
};

/**
 * Administration's write of the `finalistPick`s that land on one academy,
 * from the academy's `Gran final` page, with no window: in each modality
 * given, the judges named become exactly the ones who pick it there. A judge
 * added moves their pick from whichever academy they had, on the same row; a
 * judge left out loses theirs. Adding needs the academy eligible in the
 * modality, as the judge's own save does; letting a judge go never does, so a
 * pick on an academy that stopped qualifying can still be undone. Every judge
 * must be a judge user and one of the event's.
 *
 * One transaction under the event's lock: every modality is checked against
 * the picks as they stand, then all are written or none is, and two saves of
 * the same academy at once take turns rather than mixing.
 */
export async function setAcademyFinalistPicks(
  input: AcademyFinalistPicksInput,
): Promise<SetAcademyFinalistPicksResult> {
  const context = await readAcademyPicksContext(input);

  if (!context.ok) {
    return context;
  }

  return await db.transaction(async (tx) => {
    await lockEvent(tx, context.eventId);
    const plan = planAdditions(
      input,
      context,
      await readCurrentPicks(tx, input, context.eventId),
    );

    if (!plan.ok) {
      return plan;
    }

    for (const modality of plan.modalities) {
      const onAcademy = and(
        eq(finalistPicks.eventId, context.eventId),
        eq(finalistPicks.modalityId, modality.modalityId),
        eq(finalistPicks.academyId, input.academyId),
      );

      await tx
        .delete(finalistPicks)
        .where(
          modality.judgeIds.length > 0
            ? and(
                onAcademy,
                notInArray(finalistPicks.judgeId, [...modality.judgeIds]),
              )
            : onAcademy,
        );

      if (modality.added.length > 0) {
        await tx
          .insert(finalistPicks)
          .values(
            modality.added.map((judgeId) => ({
              academyId: input.academyId,
              eventId: context.eventId,
              judgeId,
              modalityId: modality.modalityId,
            })),
          )
          .onConflictDoUpdate({
            target: [
              finalistPicks.eventId,
              finalistPicks.judgeId,
              finalistPicks.modalityId,
            ],
            set: {
              academyId: input.academyId,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            },
          });
      }
    }

    return { ok: true };
  });
}

/**
 * Whether `setAcademyFinalistPicks` would take this save, read without
 * writing: for a caller with other writes of its own to make first, which
 * should not run for a save that will be refused. The write checks again.
 */
export async function checkAcademyFinalistPicks(
  input: AcademyFinalistPicksInput,
): Promise<SetAcademyFinalistPicksResult> {
  const context = await readAcademyPicksContext(input);

  if (!context.ok) {
    return context;
  }

  const plan = planAdditions(
    input,
    context,
    await readCurrentPicks(db, input, context.eventId),
  );

  return plan.ok ? { ok: true } : plan;
}

type Executor = Pick<typeof db, "select">;

type AcademyPicksContext = {
  eligibleModalityIds: Set<string>;
  eventId: string;
  ok: true;
};

/**
 * What a save is checked against, read before its transaction: every
 * modality in the active event and all of one event, each judge a judge user
 * and one of the event's, and the modalities the academy is eligible in.
 */
async function readAcademyPicksContext(
  input: AcademyFinalistPicksInput,
): Promise<
  AcademyPicksContext | { ok: false; reason: "not-eligible" | "not-found" }
> {
  const modalityIds = [...new Set(input.picks.map((pick) => pick.modalityId))];
  const found =
    modalityIds.length > 0
      ? await db
          .select({ eventId: modalities.eventId })
          .from(modalities)
          .innerJoin(events, eq(events.id, modalities.eventId))
          .where(and(inArray(modalities.id, modalityIds), events.active))
      : [];
  const eventId = found[0]?.eventId;

  if (
    !eventId ||
    found.length !== modalityIds.length ||
    found.some((row) => row.eventId !== eventId)
  ) {
    return modalityIds.length === 0
      ? { eligibleModalityIds: new Set(), eventId: "", ok: true }
      : { ok: false, reason: "not-found" };
  }

  const judgeIds = [...new Set(input.picks.flatMap((pick) => pick.judgeIds))];

  if (!(await areEventJudges(db, eventId, judgeIds))) {
    return { ok: false, reason: "not-found" };
  }

  const eligible = await grandFinalEligibility(eventId);

  return {
    eligibleModalityIds: new Set(
      eligible
        .filter((pair) => pair.academyId === input.academyId)
        .map((pair) => pair.modalityId),
    ),
    eventId,
    ok: true,
  };
}

async function readCurrentPicks(
  executor: Executor,
  input: AcademyFinalistPicksInput,
  eventId: string,
) {
  const modalityIds = input.picks.map((pick) => pick.modalityId);

  return modalityIds.length > 0
    ? await executor
        .select({
          judgeId: finalistPicks.judgeId,
          modalityId: finalistPicks.modalityId,
        })
        .from(finalistPicks)
        .where(
          and(
            eq(finalistPicks.eventId, eventId),
            eq(finalistPicks.academyId, input.academyId),
            inArray(finalistPicks.modalityId, modalityIds),
          ),
        )
    : [];
}

/**
 * Each modality with the judges it adds against the picks as they stand,
 * refused when it adds one where the academy is not eligible.
 */
function planAdditions(
  input: AcademyFinalistPicksInput,
  context: AcademyPicksContext,
  current: { judgeId: string; modalityId: string }[],
):
  | { modalities: (AcademyModalityPicks & { added: string[] })[]; ok: true }
  | { ok: false; reason: "not-eligible" } {
  const planned = input.picks.map((pick) => ({
    ...pick,
    added: pick.judgeIds.filter(
      (judgeId) =>
        !current.some(
          (row) =>
            row.modalityId === pick.modalityId && row.judgeId === judgeId,
        ),
    ),
  }));

  return planned.some(
    (pick) =>
      pick.added.length > 0 &&
      !context.eligibleModalityIds.has(pick.modalityId),
  )
    ? { ok: false, reason: "not-eligible" }
    : { modalities: planned, ok: true };
}

/** Whether every id is a judge user and one of the event's judges. */
async function areEventJudges(
  executor: Executor,
  eventId: string,
  judgeIds: string[],
) {
  if (judgeIds.length === 0) {
    return true;
  }

  const judgeUsers = await executor
    .select({ id: user.id })
    .from(user)
    .where(and(inArray(user.id, judgeIds), eq(user.role, "judge")));
  const eventJudges = await readEventJudges(eventId);

  return judgeIds.every(
    (judgeId) =>
      judgeUsers.some((row) => row.id === judgeId) &&
      eventJudges.some((judge) => judge.id === judgeId),
  );
}

/**
 * The judge's save: the modality in the active event, the judge one of the
 * event's, then the caller's window, then eligibility read again, then the
 * upsert of the one row per judge per modality.
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

  // Only one of the event's judges (`readEventJudges`) picks in it, from the
  // judge's list and from administration's alike: a judge user with no
  // presentation and no pick in the event has no pick to make there.
  const eventJudges = await readEventJudges(modality.eventId);

  if (!eventJudges.some((judge) => judge.id === input.judgeId)) {
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
