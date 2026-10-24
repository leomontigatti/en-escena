import { describe, expect, test } from "vitest";

import {
  clampBannerFraming,
  drawBanner,
  encodeBannerWithinBudget,
  initialBannerFraming,
  sourceWidthInFrame,
} from "@/lib/grand-final/banner-framing";

const frame = { height: 1080, width: 1920 };
const portraitPhoto = { height: 4000, width: 3000 };

/** Records the transform a draw applies, as a canvas would. */
function recordingContext() {
  const drawn = {
    background: null as null | { fill: string; height: number; width: number },
    angle: 0,
    height: 0,
    scale: 1,
    tx: 0,
    ty: 0,
    width: 0,
    x: 0,
    y: 0,
  };
  const context = {
    fillStyle: "",
    fillRect(x: number, y: number, width: number, height: number) {
      if (x === 0 && y === 0 && drawn.width === 0) {
        drawn.background = { fill: String(this.fillStyle), height, width };
      }
    },
    clearRect: () => {},
    drawImage: (
      _image: never,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => Object.assign(drawn, { height, width, x, y }),
    restore: () => {},
    rotate: (angle: number) => Object.assign(drawn, { angle }),
    save: () => {},
    scale: (scale: number) => Object.assign(drawn, { scale }),
    translate: (tx: number, ty: number) => Object.assign(drawn, { tx, ty }),
  };

  return { context, drawn };
}

/** Where the drawn picture's corners land, with the recorded transform. */
function drawnBounds(drawn: ReturnType<typeof recordingContext>["drawn"]) {
  const { angle, height, scale, tx, ty, width, x, y } = drawn;
  const corners = [
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height],
  ].map(([cx = 0, cy = 0]) => {
    const sx = cx * scale;
    const sy = cy * scale;

    return {
      x: tx + sx * Math.cos(angle) - sy * Math.sin(angle),
      y: ty + sx * Math.sin(angle) + sy * Math.cos(angle),
    };
  });

  return {
    bottom: Math.max(...corners.map((corner) => corner.y)),
    left: Math.min(...corners.map((corner) => corner.x)),
    right: Math.max(...corners.map((corner) => corner.x)),
    top: Math.min(...corners.map((corner) => corner.y)),
  };
}

function expectCovers(bounds: ReturnType<typeof drawnBounds>) {
  expect(bounds.left).toBeLessThanOrEqual(0.001);
  expect(bounds.top).toBeLessThanOrEqual(0.001);
  expect(bounds.right).toBeGreaterThanOrEqual(frame.width - 0.001);
  expect(bounds.bottom).toBeGreaterThanOrEqual(frame.height - 0.001);
}

describe("framing a banner", () => {
  // The banner has no empty bands: whatever the photo's shape, it starts
  // filling the 16:9 frame, centred.
  test("starts with a portrait photo filling the frame", () => {
    const { context, drawn } = recordingContext();

    drawBanner(context, portraitPhoto, frame, initialBannerFraming);

    const bounds = drawnBounds(drawn);
    expectCovers(bounds);
    expect(bounds.left).toBeCloseTo(0);
    expect(bounds.right).toBeCloseTo(frame.width);
  });

  test("keeps filling the frame after a quarter turn", () => {
    const { context, drawn } = recordingContext();

    drawBanner(context, portraitPhoto, frame, {
      ...initialBannerFraming,
      quarterTurns: 1,
    });

    expectCovers(drawnBounds(drawn));
  });

  // A drag past the photo's edge would open an empty band: it stops at the edge.
  test("stops a pan at the photo's edge", () => {
    const framing = clampBannerFraming(portraitPhoto, {
      ...initialBannerFraming,
      offsetY: 5,
    });
    const { context, drawn } = recordingContext();

    drawBanner(context, portraitPhoto, frame, framing);

    const bounds = drawnBounds(drawn);
    expectCovers(bounds);
    expect(bounds.top).toBeCloseTo(0);
  });

  test("lets a zoomed photo pan further, still filling the frame", () => {
    const zoomed = { ...initialBannerFraming, zoom: 2 };
    const panned = clampBannerFraming(portraitPhoto, {
      ...zoomed,
      offsetX: 5,
    });
    const { context, drawn } = recordingContext();

    drawBanner(context, portraitPhoto, frame, panned);

    expect(panned.offsetX).toBeGreaterThan(0);
    const bounds = drawnBounds(drawn);
    expectCovers(bounds);
    expect(bounds.left).toBeCloseTo(0);
  });

  // Draws the same at any size: the dialog's preview is the uploaded file.
  test("draws the same framing at the preview's size as at the upload's", () => {
    const framing = clampBannerFraming(portraitPhoto, {
      offsetX: 0.1,
      offsetY: -0.2,
      quarterTurns: 3,
      zoom: 1.7,
    });
    const preview = recordingContext();
    const upload = recordingContext();

    drawBanner(
      preview.context,
      portraitPhoto,
      { height: 270, width: 480 },
      framing,
    );
    drawBanner(upload.context, portraitPhoto, frame, framing);

    const small = drawnBounds(preview.drawn);
    const large = drawnBounds(upload.drawn);
    expect(large.left).toBeCloseTo(small.left * 4);
    expect(large.top).toBeCloseTo(small.top * 4);
    expect(large.right).toBeCloseTo(small.right * 4);
  });

  // A JPEG keeps no transparency: a transparent PNG would turn black there in
  // the upload while the preview showed the frame through it.
  test("paints the frame white under the photo, in the preview as in the upload", () => {
    const { context, drawn } = recordingContext();

    drawBanner(context, portraitPhoto, frame, initialBannerFraming);

    expect(drawn.background).toEqual({
      fill: "#ffffff",
      height: frame.height,
      width: frame.width,
    });
  });

  // Upscaling a small crop to the 1920 px banner blurs it: the editor says so.
  test("reads how many of the photo's pixels the frame spans", () => {
    expect(sourceWidthInFrame(portraitPhoto, initialBannerFraming)).toBe(3000);
    expect(
      sourceWidthInFrame(portraitPhoto, { ...initialBannerFraming, zoom: 4 }),
    ).toBe(750);
  });
});

// Every voter's phone fetches the banners: a detailed photo is encoded again,
// lighter, until it fits.
describe("encoding a banner", () => {
  const sizedAt = (sizes: Record<number, number>) => async (quality: number) =>
    new Blob([new Uint8Array(sizes[quality] ?? 0)]);

  test("keeps the first quality whose picture fits the budget", async () => {
    const encode = sizedAt({ 0.65: 300_000, 0.75: 450_000, 0.85: 700_000 });

    const banner = await encodeBannerWithinBudget(encode);

    expect(banner?.size).toBe(450_000);
  });

  test("settles for the lightest when none fits", async () => {
    const encode = sizedAt({ 0.65: 650_000, 0.75: 800_000, 0.85: 900_000 });

    const banner = await encodeBannerWithinBudget(encode);

    expect(banner?.size).toBe(650_000);
  });
});
