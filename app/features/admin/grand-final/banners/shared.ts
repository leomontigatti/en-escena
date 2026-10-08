import { z } from "zod";

import type { GrandFinalBannerSlot } from "@/lib/grand-final/banner-shape";

/**
 * What the `Gran final` banner form and its server agree on. A module of its
 * own because the view imports the field names, and the server module cannot
 * reach the browser.
 */

export const saveFinalistBannersIntent = "save-finalist-banners";

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
 * Both banners are optional, so a save with one missing or none is valid: the
 * vote's opening is what will require them. The pictures' own rule (16:9, the
 * minimum width) needs their bytes and is the server's to check.
 */
export const finalistBannersFormSchema = z.object({
  firstBannerStorageKey: z.string(),
  secondBannerStorageKey: z.string(),
});

export type FinalistBannersFormValues = z.input<
  typeof finalistBannersFormSchema
>;

export type FinalistBannersLoaderData = {
  academyId: string;
  academyName: string;
  bannerUrls: Record<GrandFinalBannerSlot, string | null>;
  selectedEventId: string;
  values: FinalistBannersFormValues;
};

export type FinalistBannersActionData = {
  message: string;
  status: "error" | "success";
};

export function buildFinalistBannersPath(academyId: string) {
  return `/administracion/gran-final/${academyId}`;
}
