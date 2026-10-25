import { describe, expect, test } from "vitest";

import { createKeptLoaderData } from "./kept-loader-data";

describe("createKeptLoaderData", () => {
  test("answers a failed reload with the data already on screen", async () => {
    const kept = createKeptLoaderData<string>();

    kept.remember("program at 21:00");

    await expect(
      kept.reload(() => Promise.reject(new Error("502"))),
    ).resolves.toBe("program at 21:00");
  });

  test("keeps the last data a reload brought", async () => {
    const kept = createKeptLoaderData<string>();

    kept.remember("program at 21:00");
    await kept.reload(() => Promise.resolve("program at 21:01"));

    await expect(
      kept.reload(() => Promise.reject(new Error("502"))),
    ).resolves.toBe("program at 21:01");
  });

  test("reports a failure when nothing is on screen yet", async () => {
    const kept = createKeptLoaderData<string>();

    await expect(
      kept.reload(() => Promise.reject(new Error("502"))),
    ).rejects.toThrow("502");
  });
});
