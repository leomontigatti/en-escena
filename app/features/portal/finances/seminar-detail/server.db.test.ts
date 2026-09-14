import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { payments, seminarInscriptions, seminarPrices } from "@/db/schema";
import { loadSeminarFinanceDetail } from "@/features/admin/finances/academy-seminars/seminar-detail/server";
import { loadPortalAcademyFinances } from "@/features/portal/finances/server";
import { loadPortalSeminarFinanceDetail } from "@/features/portal/finances/seminar-detail/server";
import { createAcademySession } from "@/features/portal/test-support/db";
import { createDancer } from "@/lib/choreographies/registration-test-fixtures.server.db";
import { allocateToSeminarInscription } from "@/lib/finances/seminar-inscription-allocation.server";
import { createSeminar } from "@/lib/seminars/repository.server";
import { removeSeminarInscriptionFromRoster } from "@/lib/seminars/inscription-withdrawal.server";
import { defaultSeminarFacts } from "@/lib/test-support/seminars";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";
import {
  academyFinancesUrl,
  createSavedEvent,
  createSignedInRequest,
} from "../../../../lib/admin/finances/finances.test-support";

installDatabaseTestHooks();

const seminarPriceAmount = 20000;

/**
 * One academy, one `Común` seminar at 50 %, two people registered in it and a
 * payment big enough to cover one deposit. Everything the two financial details
 * read is derived, so the fixture only has to state the money.
 */
async function seedFixture(quota = 5) {
  const owner = await createAcademySession({
    academyName: "Academia Portal",
    email: `portal.seminarios.${crypto.randomUUID()}@example.com`,
  });
  const event = await createSavedEvent();

  await db.insert(seminarPrices).values({
    amount: seminarPriceAmount,
    eventId: event.id,
    forParticipants: false,
    kind: "regular",
    name: "No participante general",
    paymentDeadline: null,
  });

  const created = await createSeminar(event.id, {
    instructorName: "Abril Sosa",
    scheduledDate: "2099-10-10",
    startTime: "18:30",
    quota,
    ...defaultSeminarFacts,
    requiredDepositPercentage: 50,
  });

  if (!created.ok) {
    throw new Error(created.error);
  }

  const first = await createDancer(owner.academyId, {
    firstName: "Ana",
    lastName: "López",
  });
  const second = await createDancer(owner.academyId, {
    firstName: "Nicolás",
    lastName: "Prado",
  });
  const inscriptionRows = await db
    .insert(seminarInscriptions)
    .values([
      { dancerId: first.id, seminarId: created.seminar.id },
      { dancerId: second.id, seminarId: created.seminar.id },
    ])
    .returning();

  await db.insert(payments).values({
    academyId: owner.academyId,
    amount: 50000,
    eventId: event.id,
    paymentDate: "2026-04-01",
    paymentMethod: "transferencia",
    paymentNumber: 1,
  });

  const [priceRow] = await db
    .select()
    .from(seminarPrices)
    .where(eq(seminarPrices.eventId, event.id));

  return {
    cookie: owner.cookie,
    academyId: owner.academyId,
    eventId: event.id,
    firstInscriptionId: inscriptionRows[0]!.id,
    priceId: priceRow!.id,
    secondInscriptionId: inscriptionRows[1]!.id,
    seminarId: created.seminar.id,
  };
}

type Fixture = Awaited<ReturnType<typeof seedFixture>>;

function loadPortalDetail(fixture: Fixture, seminarId?: string) {
  const id = seminarId ?? fixture.seminarId;

  return loadPortalSeminarFinanceDetail({
    params: { seminarId: id },
    request: new Request(`http://localhost/portal/finanzas/seminarios/${id}`, {
      headers: { cookie: fixture.cookie },
    }),
  });
}

async function loadPanelDetail(fixture: Fixture) {
  const signedIn = await createSignedInRequest({
    email: `admin.${crypto.randomUUID()}@example.com`,
    role: "admin",
    requestUrl: academyFinancesUrl(fixture.academyId, fixture.eventId),
  });

  return await loadSeminarFinanceDetail({
    params: { academyId: fixture.academyId, seminarId: fixture.seminarId },
    request: new Request(
      `http://localhost/administracion/finanzas/${fixture.academyId}/seminarios/${fixture.seminarId}?evento=${fixture.eventId}`,
      { headers: { cookie: signedIn.request.headers.get("cookie") ?? "" } },
    ),
  });
}

function allocate(fixture: Fixture, inscriptionId: string, amount: number) {
  return allocateToSeminarInscription({
    academyId: fixture.academyId,
    amount,
    eventId: fixture.eventId,
    inscriptionId,
    priceId: fixture.priceId,
    seminarId: fixture.seminarId,
  });
}

describe.sequential("portal seminar financial detail", () => {
  test("reports the same figures the administrator reads for the same unit", async () => {
    const fixture = await seedFixture();
    const allocated = await allocate(
      fixture,
      fixture.firstInscriptionId,
      seminarPriceAmount / 2,
    );

    expect(allocated.ok).toBe(true);

    const [portal, admin] = await Promise.all([
      loadPortalDetail(fixture),
      loadPanelDetail(fixture),
    ]);

    // The two sides read the same derivation, so the unit's five figures are
    // the same object down to the `incomplete` flags.
    expect(portal.seminar.depositAmount).toEqual(admin.seminar?.depositAmount);
    expect(portal.seminar.totalAmount).toEqual(admin.seminar?.totalAmount);
    expect(portal.seminar.owedDepositAmount).toEqual(
      admin.seminar?.owedDepositAmount,
    );
    expect(portal.seminar.owedBalanceAmount).toEqual(
      admin.seminar?.owedBalanceAmount,
    );
    expect(portal.availableBalanceAmount).toBe(admin.availableBalanceAmount);
    expect(portal.inscriptions).toEqual(admin.inscriptions);
    // And the row on the academy's `Seminarios` tab is the same unit again.
    const summary = await loadPortalAcademyFinances(
      new Request("http://localhost/portal/finanzas", {
        headers: { cookie: fixture.cookie },
      }),
    );

    expect(
      summary.seminarFinanceRows.map((row) => [
        row.id,
        row.instructorName,
        row.registrationCount,
      ]),
    ).toEqual([[fixture.seminarId, "Abril Sosa", 2]]);
  });

  test("lists a withdrawn inscription with the money it retained", async () => {
    const fixture = await seedFixture();

    await allocate(fixture, fixture.firstInscriptionId, seminarPriceAmount / 2);
    const removal = await removeSeminarInscriptionFromRoster(
      db,
      fixture.firstInscriptionId,
    );

    // Funded, so the removal is a withdrawal and the money stays on the row.
    expect(removal.withdrawn).toBe(true);

    const portal = await loadPortalDetail(fixture);
    const row = portal.inscriptions.find(
      (inscription) => inscription.inscriptionId === fixture.firstInscriptionId,
    );

    expect(row?.withdrawn).toBe(true);
    expect(row?.allocatedAmount).toBe(seminarPriceAmount / 2);
  });

  test("counts the places the same way the panel does", async () => {
    const fixture = await seedFixture(1);

    await allocate(fixture, fixture.firstInscriptionId, seminarPriceAmount / 2);

    const portal = await loadPortalDetail(fixture);

    // The quota is one and one deposit is covered, so the notice the academy
    // reads is the same fact the administrator's refusal is made of.
    expect(portal.seminar.availablePlaces).toBe(0);
  });

  test("hides a seminar the academy registered nobody in", async () => {
    const fixture = await seedFixture();

    await db
      .delete(seminarInscriptions)
      .where(eq(seminarInscriptions.seminarId, fixture.seminarId));

    await expect(loadPortalDetail(fixture)).rejects.toMatchObject({
      status: 404,
    });
  });
});
