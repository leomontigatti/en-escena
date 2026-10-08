import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { pngFile } from "@/lib/test-support/images";

import {
  createFilesystemGrandFinalBannerStorage,
  type GrandFinalBannerStorage,
} from "./grand-final-banners.server";

const bucket = "en-escena-grand-final-banners";
let baseDir = "";
let storage: GrandFinalBannerStorage;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "en-escena-banners-"));
  storage = createFilesystemGrandFinalBannerStorage({
    baseDir,
    now: () => 1_000_000,
    secret: "volume-signing-secret",
  });
});

afterEach(async () => {
  await rm(baseDir, { force: true, recursive: true });
});

const owner = { academyId: "academy-1", eventId: "event-1" };

async function storedNames() {
  return readdir(join(baseDir, bucket, "events/event-1/grand-final/academy-1"));
}

describe("grand final banner storage", () => {
  test("stores a 16:9 picture under the academy within the event", async () => {
    const result = await storage.uploadBanner({
      ...owner,
      file: pngFile("banner.png", 1920, 1080),
      slot: "first",
    });

    expect(result).toEqual({
      ok: true,
      storageKey: expect.stringMatching(
        /^events\/event-1\/grand-final\/academy-1\/first-[\w-]+\.png$/,
      ),
    });
    expect(await storedNames()).toHaveLength(1);
  });

  test("accepts a picture a few pixels off 16:9 and exactly at the minimum width", async () => {
    for (const [width, height] of [
      [1280, 720],
      [1366, 768],
    ] as const) {
      const result = await storage.uploadBanner({
        ...owner,
        file: pngFile("banner.png", width, height),
        slot: "second",
      });

      expect(result.ok, `${width}x${height}`).toBe(true);
    }
  });

  // Each upload is a new object, so a refused second picture or a failed row
  // write never leaves the first one overwritten: the caller removes the
  // replaced key once the row points at the new one.
  test("a replacement is a new object beside the one it replaces", async () => {
    const first = await storage.uploadBanner({
      ...owner,
      file: pngFile("a.png", 1920, 1080),
      slot: "first",
    });
    const replacement = await storage.uploadBanner({
      ...owner,
      file: pngFile("b.png", 1920, 1080),
      slot: "first",
    });

    if (!first.ok || !replacement.ok) {
      throw new Error("Expected both uploads to be accepted");
    }

    expect(replacement.storageKey).not.toBe(first.storageKey);
    expect(await storedNames()).toHaveLength(2);

    await storage.removeBanners([first.storageKey]);

    expect(await storedNames()).toEqual([
      replacement.storageKey.split("/").at(-1),
    ]);
  });

  test("refuses a picture that is not 16:9, before storing anything", async () => {
    const result = await storage.uploadBanner({
      ...owner,
      file: pngFile("square.png", 1600, 1600),
      slot: "first",
    });

    expect(result).toEqual({
      ok: false,
      rejection: { height: 1600, reason: "not-widescreen", width: 1600 },
    });
    await expect(storedNames()).rejects.toThrow();
  });

  test("refuses a 16:9 picture narrower than the minimum width", async () => {
    expect(
      await storage.uploadBanner({
        ...owner,
        file: pngFile("small.png", 1024, 576),
        slot: "first",
      }),
    ).toEqual({
      ok: false,
      rejection: { reason: "too-narrow", width: 1024 },
    });
  });

  test("refuses a file whose bytes are not the picture its type claims", async () => {
    expect(
      await storage.uploadBanner({
        ...owner,
        file: new File(["not a picture"], "banner.png", { type: "image/png" }),
        slot: "first",
      }),
    ).toEqual({ ok: false, rejection: { reason: "unreadable-image" } });
  });

  test("refuses a format outside the policy before reading it", async () => {
    expect(
      await storage.uploadBanner({
        ...owner,
        file: new File(["%PDF"], "banner.pdf", { type: "application/pdf" }),
        slot: "first",
      }),
    ).toEqual({
      ok: false,
      rejection: {
        contentType: "application/pdf",
        kind: "grandFinalBanner",
        reason: "unsupported-content-type",
      },
    });
  });
});
