import { describe, expect, test } from "vitest";

import { checkBannerShape, formatBannerRejection } from "./banner-shape";

describe("banner shape", () => {
  test("refuses 16:10, which is 10% off the ratio", () => {
    expect(checkBannerShape({ height: 1200, width: 1920 })).toEqual({
      height: 1200,
      reason: "not-widescreen",
      width: 1920,
    });
  });

  test("accepts a picture exactly 2% off 16:9, on either side", () => {
    expect(checkBannerShape({ height: 900, width: 1632 })).toBeNull();
    expect(checkBannerShape({ height: 900, width: 1568 })).toBeNull();
    expect(checkBannerShape({ height: 900, width: 1633 })).not.toBeNull();
  });

  test("names the banner and the rule it broke, with the picture's size", () => {
    expect(
      formatBannerRejection(
        { height: 1600, reason: "not-widescreen", width: 1600 },
        "second",
      ),
    ).toBe(
      "El Banner 2 tiene que ser horizontal 16:9, como 1920 × 1080; el elegido mide 1600 × 1600.",
    );
    expect(
      formatBannerRejection({ reason: "too-narrow", width: 1024 }, "first"),
    ).toBe(
      "El Banner 1 tiene que medir al menos 1280 px de ancho; el elegido mide 1024 px.",
    );
  });

  test("says the format and the ceiling through the shared upload copy", () => {
    expect(
      formatBannerRejection(
        {
          contentType: "application/pdf",
          kind: "grandFinalBanner",
          reason: "unsupported-content-type",
        },
        "first",
      ),
    ).toBe("El archivo del Banner 1 debe ser JPG, PNG o WEBP.");
  });
});
