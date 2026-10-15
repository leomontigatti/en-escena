import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { payments } from "@/db/schema";
import { loadFinancesList } from "@/features/admin/finances/list/server";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createSavedEvent } from "@/lib/test-support/events";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe("loadFinancesList", () => {
  // #1667 revisits #1656: an individual's money is administration's to
  // operate, so the list shows it beside the academies, told apart by `Tipo`.
  test("lists an individual with money in the event beside the academies, with its kind", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      academyName: "Academia Uno",
      email: "academia.uno@example.com",
    });
    const individual = await createAcademyUser({
      academyName: "Ana Particular",
      email: "ana.particular@example.com",
      kind: "individual",
    });
    await db.insert(payments).values(
      [academy.academyId, individual.academyId].map((academyId, index) => ({
        academyId,
        amount: 10000,
        eventId: event.id,
        paymentDate: "2026-04-01",
        paymentMethod: "efectivo" as const,
        paymentNumber: index + 1,
      })),
    );
    const { request } = await createSignedInRequest({
      email: "admin.finanzas@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/finanzas",
    });

    const list = await loadFinancesList(request);

    expect(
      list.rows.map((row) => ({ kind: row.kind, name: row.academyName })),
    ).toEqual([
      { kind: "academy", name: "Academia Uno" },
      { kind: "individual", name: "Ana Particular" },
    ]);
  });
});
