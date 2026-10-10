import { z } from "zod";

import type { GrandFinalBannerSlot } from "@/lib/grand-final/banner-shape";

/**
 * What an academy's `Gran final` page in one modality and its server agree
 * on: the judges who picked it there, and its banners once it is a
 * `finalist`. A
 * module of its own because the view imports the field names, and the server
 * module cannot reach the browser.
 */

export const saveAcademyGrandFinalIntent = "save-academy-grand-final";

/**
 * Each banner travels as a file input and a hidden storage key: a picked file
 * replaces the banner, an emptied key with no file removes it, and the stored
 * key sent back keeps it.
 */
export const bannerFieldNames = {
  first: { file: "firstBanner", storageKey: "firstBannerStorageKey" },
  second: { file: "secondBanner", storageKey: "secondBannerStorageKey" },
} as const satisfies Record<
  GrandFinalBannerSlot,
  { file: string; storageKey: string }
>;

/**
 * The page posts its judges under `judgeIdsFieldName`, and this marker beside
 * them: a field whose judges were all taken away posts no judge, and the
 * marker is what says so. A body without it leaves the picks alone.
 */
export const judgeIdsFieldName = "judgeIds";

export const judgeIdsPostedFieldName = "judgeIdsPosted";

/**
 * Both banners are optional, so a save with one missing or none is valid: the
 * vote's opening is what will require them. The pictures' own rule (16:9, the
 * minimum width) needs their bytes and is the server's to check. The judges
 * are any of the event's, none included.
 */
export const academyGrandFinalFormSchema = z.object({
  firstBannerStorageKey: z.string(),
  judgeIds: z.array(z.string()),
  secondBannerStorageKey: z.string(),
});

export type AcademyGrandFinalFormValues = z.input<
  typeof academyGrandFinalFormSchema
>;

export type AcademyGrandFinalLoaderData = {
  academyId: string;
  academyName: string;
  bannerUrls: Record<GrandFinalBannerSlot, string | null>;
  /**
   * Whether it still qualifies in the modality: one picked before it stopped
   * stays on the list, and its judges can only be taken away.
   */
  eligible: boolean;
  /** Whether any judge picked it, in any modality: only a `finalist` has banners. */
  finalist: boolean;
  judges: { id: string; name: string }[];
  modalityId: string;
  modalityName: string;
  /**
   * The academy each other judge picked in the modality, by judge: what a
   * judge added here stops picking, which the save names before it writes.
   */
  otherPicks: Record<string, string>;
  selectedEventId: string;
  values: AcademyGrandFinalFormValues;
};

export type AcademyGrandFinalActionData = {
  message: string;
  status: "error" | "success";
};

export function buildAcademyGrandFinalPath(
  academyId: string,
  modalityId: string,
) {
  return `/administracion/gran-final/${academyId}/${modalityId}`;
}
