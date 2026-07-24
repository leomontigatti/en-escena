import { AccessTicket, ArcaServiceNames } from "@arcasdk/core";
import { describe, expect, test } from "vitest";

import { InMemoryTaCache } from "./ta-cache.server";

// Construye un TA con el vencimiento indicado. La forma sigue el
// `ILoginCredentials` que devuelve el `loginCms` de WSAA.
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
  test("reusa un TA vigente entre llamadas sin re-autenticar", async () => {
    const cache = new InMemoryTaCache();
    const ticket = makeTicket(inTwelveHours);

    await cache.save(ticket, ArcaServiceNames.WSFE);

    expect(await cache.get(ArcaServiceNames.WSFE)).toBe(ticket);
    expect(await cache.get(ArcaServiceNames.WSFE)).toBe(ticket);
  });

  test("descarta un TA vencido para forzar la re-autenticación", async () => {
    const cache = new InMemoryTaCache();

    await cache.save(makeTicket(anHourAgo), ArcaServiceNames.WSFE);

    expect(await cache.get(ArcaServiceNames.WSFE)).toBeNull();
  });

  test("devuelve null cuando nunca se cacheó un TA para ese servicio", async () => {
    const cache = new InMemoryTaCache();

    expect(await cache.get(ArcaServiceNames.WSFE)).toBeNull();
  });

  test("no comparte TA entre instancias distintas de cache", async () => {
    const first = new InMemoryTaCache();
    const second = new InMemoryTaCache();

    await first.save(makeTicket(inTwelveHours), ArcaServiceNames.WSFE);

    expect(await second.get(ArcaServiceNames.WSFE)).toBeNull();
  });

  test("delete evicta el TA cacheado", async () => {
    const cache = new InMemoryTaCache();
    await cache.save(makeTicket(inTwelveHours), ArcaServiceNames.WSFE);

    await cache.delete(ArcaServiceNames.WSFE);

    expect(await cache.get(ArcaServiceNames.WSFE)).toBeNull();
  });
});
