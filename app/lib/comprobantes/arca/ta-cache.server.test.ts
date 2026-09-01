import { AccessTicket, ArcaServiceNames } from "@arcasdk/core";
import { describe, expect, test } from "vitest";

import { InMemoryTaCache } from "./ta-cache.server";

// Builds a TA with the given expiry. The shape follows the `ILoginCredentials`
// that WSAA's `loginCms` returns.
function makeTicket(expirationtime: string): AccessTicket {
  return AccessTicket.create({
    header: [
      { version: "1.0" },
      {
        source: "CN=wsaahomo",
        destination: "CN=emisor",
        uniqueid: "1",
        generationtime: "2026-07-22T00:00:00-03:00",
        expirationtime,
      },
    ],
    credentials: { token: "token-abc", sign: "sign-xyz" },
  });
}

const inTwelveHours = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

describe("InMemoryTaCache", () => {
  test("reuses a live TA across calls without re-authenticating", async () => {
    const cache = new InMemoryTaCache();
    const ticket = makeTicket(inTwelveHours);

    await cache.save(ticket, ArcaServiceNames.WSFE);

    expect(await cache.get(ArcaServiceNames.WSFE)).toBe(ticket);
    expect(await cache.get(ArcaServiceNames.WSFE)).toBe(ticket);
  });

  test("discards an expired TA to force re-authentication", async () => {
    const cache = new InMemoryTaCache();

    await cache.save(makeTicket(anHourAgo), ArcaServiceNames.WSFE);

    expect(await cache.get(ArcaServiceNames.WSFE)).toBeNull();
  });

  test("returns null when no TA was ever cached for that service", async () => {
    const cache = new InMemoryTaCache();

    expect(await cache.get(ArcaServiceNames.WSFE)).toBeNull();
  });

  test("does not share a TA across different cache instances", async () => {
    const first = new InMemoryTaCache();
    const second = new InMemoryTaCache();

    await first.save(makeTicket(inTwelveHours), ArcaServiceNames.WSFE);

    expect(await second.get(ArcaServiceNames.WSFE)).toBeNull();
  });

  test("delete evicts the cached TA", async () => {
    const cache = new InMemoryTaCache();
    await cache.save(makeTicket(inTwelveHours), ArcaServiceNames.WSFE);

    await cache.delete(ArcaServiceNames.WSFE);

    expect(await cache.get(ArcaServiceNames.WSFE)).toBeNull();
  });
});
