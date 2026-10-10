import { describe, expect, test, vi } from "vitest";

import { cacheFor } from "@/lib/shared/short-lived-cache";

function fakeClock(start = 1_000_000) {
  let now = start;

  return {
    advance(ms: number) {
      now += ms;
    },
    now: () => now,
  };
}

describe("cacheFor", () => {
  test("loads once for every read within the window", async () => {
    const clock = fakeClock();
    const load = vi.fn(async () => "program");
    const cache = cacheFor(20_000, load, clock.now);

    await expect(cache()).resolves.toBe("program");
    clock.advance(19_999);
    await expect(cache()).resolves.toBe("program");

    expect(load).toHaveBeenCalledTimes(1);
  });

  test("loads again once the window has passed", async () => {
    const clock = fakeClock();
    let calls = 0;
    const cache = cacheFor(20_000, async () => ++calls, clock.now);

    await cache();
    clock.advance(20_000);

    await expect(cache()).resolves.toBe(2);
  });

  test("shares one load between reads that arrive while it runs", async () => {
    const clock = fakeClock();
    const load = vi.fn(
      () => new Promise<string>((resolve) => setTimeout(resolve, 0, "x")),
    );
    const cache = cacheFor(20_000, load, clock.now);

    await Promise.all([cache(), cache(), cache()]);

    expect(load).toHaveBeenCalledTimes(1);
  });

  test("counts the window from when a slow load finished", async () => {
    const clock = fakeClock();
    let finish: (value: string) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const cache = cacheFor(20_000, load, clock.now);

    const first = cache();
    clock.advance(30_000);
    const second = cache();
    finish("program");
    await Promise.all([first, second]);
    clock.advance(19_999);
    await cache();

    expect(load).toHaveBeenCalledTimes(1);
  });

  test("keeps no failure: the next read loads again", async () => {
    const clock = fakeClock();
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce("program");
    const cache = cacheFor(20_000, load, clock.now);

    await expect(cache()).rejects.toThrow("down");
    await expect(cache()).resolves.toBe("program");
  });
});
