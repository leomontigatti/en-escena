import {
  formatUploadRejection,
  type UploadRejection,
} from "@/lib/storage/asset-kinds";

/**
 * The shape a `finalist`'s banner must have: the vote page shows the two
 * pictures in a 16:9 carousel, so anything else is cropped or distorted, and a
 * narrow one is blurred on a phone held sideways. Client-safe, so the form can
 * say the rule with the same numbers the server enforces.
 */

/** Two banners per finalist: the carousel's first picture and its second. */
export const grandFinalBannerSlots = ["first", "second"] as const;

export type GrandFinalBannerSlot = (typeof grandFinalBannerSlots)[number];

export const grandFinalBannerSlotLabels: Record<GrandFinalBannerSlot, string> =
  {
    first: "Banner 1",
    second: "Banner 2",
  };

const GRAND_FINAL_BANNER_MIN_WIDTH = 1280;

/**
 * How far from 16:9 a picture may be, as a share of the ratio: one fiftieth,
 * 2%. Wide enough for the screen sizes people export at (1366 × 768 is 0.05%
 * off), narrow enough to refuse 16:10 (10% off).
 */
const WIDESCREEN_TOLERANCE_DIVISOR = 50;

export const grandFinalBannerRuleLabel = `Horizontal 16:9, de al menos ${GRAND_FINAL_BANNER_MIN_WIDTH} px de ancho`;

export type BannerShapeRejection =
  | { height: number; reason: "not-widescreen"; width: number }
  | { reason: "too-narrow"; width: number };

export type BannerRejection =
  BannerShapeRejection | UploadRejection | { reason: "unreadable-image" };

export function checkBannerShape(size: {
  height: number;
  width: number;
}): BannerShapeRejection | null {
  // |w/h − 16/9| / (16/9) is |9w − 16h| / 16h. Compared in whole pixels, so
  // a picture exactly at the tolerance is not refused by a rounding error.
  if (
    WIDESCREEN_TOLERANCE_DIVISOR * Math.abs(9 * size.width - 16 * size.height) >
    16 * size.height
  ) {
    return { height: size.height, reason: "not-widescreen", width: size.width };
  }

  if (size.width < GRAND_FINAL_BANNER_MIN_WIDTH) {
    return { reason: "too-narrow", width: size.width };
  }

  return null;
}

/** The refusal in Spanish, naming the banner and the rule it broke. */
export function formatBannerRejection(
  rejection: BannerRejection,
  slot: GrandFinalBannerSlot,
) {
  const label = grandFinalBannerSlotLabels[slot];

  switch (rejection.reason) {
    case "not-widescreen":
      return `El ${label} tiene que ser horizontal 16:9, como 1920 × 1080; el elegido mide ${rejection.width} × ${rejection.height}.`;
    case "too-narrow":
      return `El ${label} tiene que medir al menos ${GRAND_FINAL_BANNER_MIN_WIDTH} px de ancho; el elegido mide ${rejection.width} px.`;
    case "unreadable-image":
      return `No pudimos leer el ${label} como imagen. Elegí un archivo JPG, PNG o WEBP.`;
    case "file-too-large":
    case "unsupported-content-type":
      return formatUploadRejection(rejection, {
        fieldLabel: label,
        gender: "masculine",
      });
  }
}
