import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { finalistBanners, finalistPicks } from "@/db/schema";
import {
  grandFinalBannerSlots,
  type BannerRejection,
  type GrandFinalBannerSlot,
} from "@/lib/grand-final/banner-shape";
import { readAcademyNames } from "@/lib/grand-final/finalist-pick.server";
import { describeServerError } from "@/lib/shared/unexpected-error-log.server";
import type { GrandFinalBannerStorage } from "@/lib/storage/grand-final-banners.server";

/**
 * A `finalist`'s two `Gran final` banners: what administration uploads for
 * each picked academy, and what the vote page will show. They belong to the
 * academy within the event, so a pick change never touches them.
 */

export type FinalistBannerKeys = Record<GrandFinalBannerSlot, string | null>;

const noBanners: FinalistBannerKeys = { first: null, second: null };

/**
 * The finalist academy's name and its banner keys, or null when no judge
 * picked it in the event: only a finalist has banners to manage.
 */
export async function readFinalistBanners(input: {
  academyId: string;
  eventId: string;
}): Promise<{ academyName: string; keys: FinalistBannerKeys } | null> {
  if (!(await isFinalist(input))) {
    return null;
  }

  const [names, keys] = await Promise.all([
    readAcademyNames([input.academyId]),
    readBannerKeys(input),
  ]);

  return { academyName: names.get(input.academyId) ?? "", keys };
}

/** How many of its two banners each academy of the event has. */
export async function readBannerCounts(eventId: string) {
  const rows = await db
    .select({
      academyId: finalistBanners.academyId,
      firstStorageKey: finalistBanners.firstStorageKey,
      secondStorageKey: finalistBanners.secondStorageKey,
    })
    .from(finalistBanners)
    .where(eq(finalistBanners.eventId, eventId));

  return new Map(
    rows.map((row) => [
      row.academyId,
      Number(row.firstStorageKey !== null) +
        Number(row.secondStorageKey !== null),
    ]),
  );
}

/** What the form asks of one banner: keep it, drop it, or take a new one. */
export type BannerChange =
  { kind: "keep" } | { kind: "remove" } | { file: Blob; kind: "upload" };

export type SaveFinalistBannersResult =
  | { ok: true }
  | { ok: false; reason: "not-finalist" }
  | {
      ok: false;
      reason: "rejected";
      rejection: BannerRejection;
      slot: GrandFinalBannerSlot;
    };

/**
 * Applies both changes or neither. Every new picture is uploaded first, each
 * as a new object; a refusal, or an upload that throws, removes what this
 * save uploaded and leaves the row alone. The changes are then applied to the
 * row as it stands under a lock, not as the form last saw it, so two saves of
 * the same academy at once cannot leave it pointing at an object the other
 * deleted. Only after the row is written are the objects it no longer names
 * deleted, so a failure at any step leaves the banners in use readable.
 */
export async function saveFinalistBanners(input: {
  academyId: string;
  changes: Record<GrandFinalBannerSlot, BannerChange>;
  eventId: string;
  storage: GrandFinalBannerStorage;
}): Promise<SaveFinalistBannersResult> {
  if (!(await isFinalist(input))) {
    return { ok: false, reason: "not-finalist" };
  }

  const uploads = await uploadNewBanners(input);

  if (!uploads.ok) {
    return uploads;
  }

  let replaced: string[];

  try {
    replaced = await db.transaction(async (tx) => {
      const owner = and(
        eq(finalistBanners.eventId, input.eventId),
        eq(finalistBanners.academyId, input.academyId),
      );

      await tx
        .insert(finalistBanners)
        .values({ academyId: input.academyId, eventId: input.eventId })
        .onConflictDoNothing();

      const [stored] = await tx
        .select({
          first: finalistBanners.firstStorageKey,
          second: finalistBanners.secondStorageKey,
        })
        .from(finalistBanners)
        .where(owner)
        .for("update");
      const next: FinalistBannerKeys = { ...stored };

      for (const slot of grandFinalBannerSlots) {
        const change = input.changes[slot];

        if (change.kind === "remove") {
          next[slot] = null;
        }

        if (change.kind === "upload") {
          next[slot] = uploads.keys[slot] ?? null;
        }
      }

      await tx
        .update(finalistBanners)
        .set({
          firstStorageKey: next.first,
          secondStorageKey: next.second,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(owner);

      return grandFinalBannerSlots
        .map((slot) => stored[slot])
        .filter(
          (key): key is string =>
            key !== null && key !== next.first && key !== next.second,
        );
    });
  } catch (thrown) {
    await removeQuietly(input.storage, Object.values(uploads.keys));
    throw thrown;
  }

  // After the row moved on, a failed delete orphans an object nothing points
  // at; the save itself already succeeded, so it is logged, not reported.
  try {
    await input.storage.removeBanners(replaced);
  } catch (thrown) {
    console.error("[storage:grand-final-banner:orphan]", {
      storageKeys: replaced,
      error: describeServerError(thrown),
    });
  }

  return { ok: true };
}

/**
 * Uploads the banners the save replaces, or none: the first refusal or
 * thrown upload removes the ones already stored by this save.
 */
async function uploadNewBanners(input: {
  academyId: string;
  changes: Record<GrandFinalBannerSlot, BannerChange>;
  eventId: string;
  storage: GrandFinalBannerStorage;
}): Promise<
  | Extract<SaveFinalistBannersResult, { reason: "rejected" }>
  | { keys: Partial<Record<GrandFinalBannerSlot, string>>; ok: true }
> {
  const keys: Partial<Record<GrandFinalBannerSlot, string>> = {};

  try {
    for (const slot of grandFinalBannerSlots) {
      const change = input.changes[slot];

      if (change.kind !== "upload") {
        continue;
      }

      const result = await input.storage.uploadBanner({
        academyId: input.academyId,
        eventId: input.eventId,
        file: change.file,
        slot,
      });

      if (!result.ok) {
        await removeQuietly(input.storage, Object.values(keys));

        return {
          ok: false,
          reason: "rejected",
          rejection: result.rejection,
          slot,
        };
      }

      keys[slot] = result.storageKey;
    }
  } catch (thrown) {
    await removeQuietly(input.storage, Object.values(keys));
    throw thrown;
  }

  return { keys, ok: true };
}

/**
 * Cleanup on a failure path: a delete that fails is logged and must not
 * replace the refusal or the error that made the save back out.
 */
async function removeQuietly(
  storage: GrandFinalBannerStorage,
  storageKeys: string[],
) {
  try {
    await storage.removeBanners(storageKeys);
  } catch (thrown) {
    console.error("[storage:grand-final-banner:orphan]", {
      storageKeys,
      error: describeServerError(thrown),
    });
  }
}

async function isFinalist(input: { academyId: string; eventId: string }) {
  const [pick] = await db
    .select({ id: finalistPicks.id })
    .from(finalistPicks)
    .where(
      and(
        eq(finalistPicks.eventId, input.eventId),
        eq(finalistPicks.academyId, input.academyId),
      ),
    )
    .limit(1);

  return pick !== undefined;
}

async function readBannerKeys(input: {
  academyId: string;
  eventId: string;
}): Promise<FinalistBannerKeys> {
  const [row] = await db
    .select({
      first: finalistBanners.firstStorageKey,
      second: finalistBanners.secondStorageKey,
    })
    .from(finalistBanners)
    .where(
      and(
        eq(finalistBanners.eventId, input.eventId),
        eq(finalistBanners.academyId, input.academyId),
      ),
    );

  return row ?? noBanners;
}
