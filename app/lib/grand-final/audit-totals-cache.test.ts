import { describe, expect, test, vi } from "vitest";

import { createAuditTotalsCache } from "@/lib/grand-final/audit-totals-cache";

function setUp(ttlMs = 5000) {
  let now = 0;
  const read = vi.fn(async (eventId: string) => `${eventId}@${now}`);
  const cache = createAuditTotalsCache({ now: () => now, read, ttlMs });

  return {
    cache,
    read,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

describe("`createAuditTotalsCache`", () => {
  test("answers every read within the time to live from one computation", async () => {
    const { cache, read, tick } = setUp();

    await expect(cache.read("evento")).resolves.toBe("evento@0");
    tick(4999);
    await expect(cache.read("evento")).resolves.toBe("evento@0");
    expect(read).toHaveBeenCalledTimes(1);
  });

  test("computes again once the time to live passed", async () => {
    const { cache, read, tick } = setUp();
    await cache.read("evento");
    tick(5000);

    await expect(cache.read("evento")).resolves.toBe("evento@5000");
    expect(read).toHaveBeenCalledTimes(2);
  });

  test("shares one computation among reads that arrive together", async () => {
    const { cache, read } = setUp();

    await Promise.all([cache.read("evento"), cache.read("evento")]);

    expect(read).toHaveBeenCalledTimes(1);
  });

  test("shares a computation that outlasts the time to live, which starts once it settles", async () => {
    let now = 0;
    let finish: (value: string) => void = () => {};
    const read = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const cache = createAuditTotalsCache({ now: () => now, read, ttlMs: 5000 });

    const first = cache.read("evento");
    now = 8000;
    const second = cache.read("evento");
    finish("totales");

    await expect(Promise.all([first, second])).resolves.toEqual([
      "totales",
      "totales",
    ]);
    expect(read).toHaveBeenCalledTimes(1);

    now = 12999;
    await cache.read("evento");
    expect(read).toHaveBeenCalledTimes(1);
  });

  test("keeps each event's totals apart", async () => {
    const { cache, read } = setUp();

    await cache.read("uno");
    await expect(cache.read("dos")).resolves.toBe("dos@0");
    expect(read).toHaveBeenCalledTimes(2);
  });

  test("does not keep a failed computation", async () => {
    const { cache, read } = setUp();
    read.mockRejectedValueOnce(new Error("database down"));

    await expect(cache.read("evento")).rejects.toThrow("database down");
    await expect(cache.read("evento")).resolves.toBe("evento@0");
  });
});
