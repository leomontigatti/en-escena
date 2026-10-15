import { afterEach, describe, expect, test, vi } from "vitest";

// postgres.js connects on the first query, never on `postgres()`, so these
// tests build a client without a database behind the URL.
async function importFreshDb() {
  vi.resetModules();
  return import("@/db");
}

describe("@/db client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // The dev server re-evaluates server modules on every edit. A client per
  // evaluation left the previous pool's connections open until the server
  // stopped, and a long session exhausted the shared Postgres.
  test("a re-evaluated module reuses the client it already opened", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:secret@127.0.0.1:1/reuse");

    const first = await importFreshDb();
    const second = await importFreshDb();

    // The proxy hides the client itself; postgres.js builds a fresh `options`
    // object per client, so the same object means the same client.
    expect(second.client.options).toBe(first.client.options);
  });

  test("idle connections close on their own", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:secret@127.0.0.1:1/idle");

    const { client } = await importFreshDb();

    expect(client.options.idle_timeout).toBeGreaterThan(0);
  });
});
