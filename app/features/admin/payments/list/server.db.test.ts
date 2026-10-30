import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  paymentAllocations,
  payments,
  refunds,
} from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import { createAcademyFinanceChoreographyFixture } from "@/lib/admin/finances/finances.test-support";
import * as availableBalance from "@/lib/finances/available-balance.server";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createSavedEvent } from "@/lib/test-support/events";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { handleMovementsListAction, loadMovementsList } from "./server";

installDatabaseTestHooks();

describe("admin movements list", () => {
  // Three payments in the state the pool leaves them in: drained oldest-first,
  // so one is spent, one is partly drawn and the newest is untouched.
  test("reads what is still free on each payment and over the event", async () => {
    await buildPaymentsFixture();

    const loaderData = await loadMovementsList(await listRequest());

    expect(rowsByNumber(loaderData)).toEqual({
      1: { amount: 10000, availableAmount: 0 },
      2: { amount: 8000, availableAmount: 3000 },
      3: { amount: 5000, availableAmount: 5000 },
    });
    expect(loaderData.summary).toEqual({
      availableAmount: 8000,
      netAmount: 23000,
      paymentsAmount: 23000,
      refundsAmount: 0,
    });
  });

  test("narrows the list to the payments that still have money free", async () => {
    await buildPaymentsFixture();

    const loaderData = await loadMovementsList(
      await listRequest("disponible=con"),
    );

    expect(Object.keys(rowsByNumber(loaderData))).toEqual(["2", "3"]);
    expect(loaderData.totalCount).toBe(2);
  });

  test("narrows the list to the payments already fully applied", async () => {
    await buildPaymentsFixture();

    const loaderData = await loadMovementsList(
      await listRequest("disponible=sin"),
    );

    expect(Object.keys(rowsByNumber(loaderData))).toEqual(["1"]);
    expect(loaderData.totalCount).toBe(1);
  });

  // The cards answer for the event, so narrowing the list must not move them:
  // the reader consults the position and then filters down to it.
  test("keeps the summary on the whole event under any filter", async () => {
    await buildMovementsFixture();

    for (const search of [
      "disponible=con",
      "disponible=sin",
      "medio=efectivo",
      "tipo=reembolso",
      "busqueda=00002",
    ]) {
      const loaderData = await loadMovementsList(await listRequest(search));

      expect(loaderData.summary).toEqual({
        availableAmount: 2000,
        netAmount: 17000,
        paymentsAmount: 23000,
        refundsAmount: 6000,
      });
    }
  });

  test("keeps the availability filter in the canonical url", async () => {
    await buildPaymentsFixture();

    const loaderData = await loadMovementsList(
      await listRequest("disponible=con"),
    );

    expect(loaderData.filters.availability).toBe("con");
  });

  // An unknown value is not a filter. It is dropped the same way every other
  // unrecognised parameter is —by redirecting to the canonical url— so the
  // address bar never claims a narrowing that is not applied.
  test("drops an unknown availability value from the url", async () => {
    await buildPaymentsFixture();

    const redirect = await expectThrownRedirect(
      await listRequest("disponible=quizas"),
    );

    expect(redirect.headers.get("location")).toBe(
      "/administracion/movimientos",
    );
  });

  test("finds a payment whatever accents the search is typed with", async () => {
    await buildPaymentsFixture();

    const loaderData = await loadMovementsList(
      await listRequest("busqueda=ACAD%C3%89MIA+PAGOS"),
    );

    expect(loaderData.rows).toHaveLength(3);
  });

  test("sorts by date both ways, by number within a day", async () => {
    await buildPaymentsFixture();

    const newestFirst = await loadMovementsList(await listRequest());
    const oldestFirst = await loadMovementsList(
      await listRequest("orden=date%3Aasc"),
    );

    expect(newestFirst.rows.map((row) => row.number)).toEqual([2, 1, 3]);
    expect(oldestFirst.rows.map((row) => row.number)).toEqual([3, 1, 2]);
  });

  test("redirects a page past the last one, and the retired event parameter, to the canonical url", async () => {
    const fixture = await buildPaymentsFixture();

    const redirect = await expectThrownRedirect(
      await listRequest(
        `evento=${fixture.eventId}&medio=transferencia&pagina=9`,
      ),
    );

    expect(redirect.headers.get("location")).toBe(
      "/administracion/movimientos?medio=transferencia",
    );
  });
});

describe("refunds in the admin movements list", () => {
  // 6000 refunded draws the newest payment's 5000 whole and 1000 of the
  // second's 3000, so `Disponible` reads what the pool reads.
  test("lists the event's payments and refunds newest first, each in its own series", async () => {
    await buildMovementsFixture();

    const loaderData = await loadMovementsList(await listRequest());

    expect(movementKeys(loaderData)).toEqual([
      "refund:1",
      "payment:2",
      "payment:1",
      "refund:2",
      "payment:3",
    ]);
    expect(rowsByNumber(loaderData)).toEqual({
      1: { amount: 10000, availableAmount: 0 },
      2: { amount: 8000, availableAmount: 2000 },
      3: { amount: 5000, availableAmount: 0 },
    });
    expect(
      loaderData.rows
        .filter((row) => row.kind === "refund")
        .map((row) => [row.number, row.amount, row.method]),
    ).toEqual([
      [1, 4000, "efectivo"],
      [2, 2000, "transferencia"],
    ]);
    expect(loaderData.summary).toEqual({
      availableAmount: 2000,
      netAmount: 17000,
      paymentsAmount: 23000,
      refundsAmount: 6000,
    });
    expect(loaderData.totalCount).toBe(5);
    expect(loaderData.hasAnyMovement).toBe(true);
  });

  // Two movements of one day keep the order they were recorded in, as on the
  // owner's tab, whatever their kinds and numbers.
  test("orders one day's movements by recording time", async () => {
    const pool = await buildPaymentsFixture();
    await insertRefunds(pool, [
      {
        amount: 100,
        createdAt: "2099-01-01T00:00:00Z",
        refundDate: "2026-03-16",
        refundNumber: 1,
      },
      {
        amount: 100,
        createdAt: "2000-01-01T00:00:00Z",
        refundDate: "2026-03-16",
        refundNumber: 2,
      },
    ]);

    const loaderData = await loadMovementsList(await listRequest());

    expect(movementKeys(loaderData).slice(0, 4)).toEqual([
      "refund:1",
      "payment:2",
      "payment:1",
      "refund:2",
    ]);
  });

  test("leaves out another event's refunds", async () => {
    await buildMovementsFixture();
    const otherEvent = await createSavedEvent({ active: false });
    const other = await buildPaymentsFixtureIn(otherEvent);
    await insertRefunds(other, [
      {
        amount: 1000,
        createdAt: "2026-03-18T12:00:00Z",
        refundDate: "2026-03-18",
        refundNumber: 1,
      },
    ]);

    const loaderData = await loadMovementsList(await listRequest());

    expect(loaderData.totalCount).toBe(5);
    expect(loaderData.summary.refundsAmount).toBe(6000);
  });

  test("narrows to one kind with the `Tipo` filter", async () => {
    await buildMovementsFixture();

    const refundsOnly = await loadMovementsList(
      await listRequest("tipo=reembolso"),
    );
    const paymentsOnly = await loadMovementsList(
      await listRequest("tipo=pago"),
    );

    expect(movementKeys(refundsOnly)).toEqual(["refund:1", "refund:2"]);
    expect(refundsOnly.filters.kind).toBe("refund");
    expect(refundsOnly.totalCount).toBe(2);
    expect(movementKeys(paymentsOnly)).toEqual([
      "payment:2",
      "payment:1",
      "payment:3",
    ]);
  });

  test("drops an unknown kind from the url", async () => {
    await buildMovementsFixture();

    const redirect = await expectThrownRedirect(
      await listRequest("tipo=credito"),
    );

    expect(redirect.headers.get("location")).toBe(
      "/administracion/movimientos",
    );
  });

  // The method filter reads a refund's `refundMethod` as a payment's method.
  test("narrows both kinds by method", async () => {
    await buildMovementsFixture();

    const loaderData = await loadMovementsList(
      await listRequest("medio=efectivo"),
    );

    expect(movementKeys(loaderData)).toEqual(["refund:1"]);
  });

  // `Disponible` is a payment's figure: a refund has none, so narrowing on it
  // is a question about payments.
  test("keeps refunds out of the availability filter", async () => {
    await buildMovementsFixture();

    const withAvailable = await loadMovementsList(
      await listRequest("disponible=con"),
    );
    const without = await loadMovementsList(
      await listRequest("disponible=sin"),
    );

    expect(movementKeys(withAvailable)).toEqual(["payment:2"]);
    expect(movementKeys(without)).toEqual(["payment:1", "payment:3"]);
  });

  test("searches both kinds by academy and by number", async () => {
    await buildMovementsFixture();

    const byAcademy = await loadMovementsList(
      await listRequest("busqueda=academia+pagos"),
    );
    const byNumber = await loadMovementsList(
      await listRequest("busqueda=00002"),
    );

    expect(byAcademy.totalCount).toBe(5);
    expect(movementKeys(byNumber)).toEqual(["payment:2", "refund:2"]);
  });

  test("paginates across both kinds", async () => {
    const event = await createSavedEvent();
    const pool = await buildPaymentsFixtureIn(event, { payments: 30 });
    await insertRefunds(
      pool,
      Array.from({ length: 30 }, (_, index) => ({
        amount: 1,
        createdAt: `2026-02-01T00:00:${String(index).padStart(2, "0")}Z`,
        refundDate: "2026-02-01",
        refundNumber: index + 1,
      })),
    );

    const firstPage = await loadMovementsList(await listRequest());
    const secondPage = await loadMovementsList(await listRequest("pagina=2"));

    expect(firstPage.totalCount).toBe(60);
    expect(firstPage.totalPages).toBe(2);
    expect(firstPage.rows).toHaveLength(50);
    // Payments are dated in March, so the older refunds close the list.
    expect(secondPage.rows.map((row) => row.kind)).toEqual(
      Array.from({ length: 10 }, () => "refund"),
    );
    expect(secondPage.rows.at(-1)?.number).toBe(1);
  });

  // What the edit/delete dialog needs, on the row it opens from: the refund's
  // own fields with the version it edits, and its owner's `Saldo disponible`,
  // which caps a raise.
  test("gives a refund row what its dialog edits", async () => {
    const fixture = await buildMovementsFixture();

    const loaderData = await loadMovementsList(await listRequest());
    const refund = loaderData.rows.find(
      (row) => row.kind === "refund" && row.number === 1,
    );

    expect(refund).toMatchObject({
      academyId: fixture.academyId,
      date: "2026-03-17",
      internalNote: "Devuelto por error de carga",
      ownerAvailableBalanceAmount: 2000,
      reference: null,
      version: fixture.refunds[0]!.updatedAt.toISOString(),
    });
  });

  // The dialog saves its fields against its version, so a refund edited while
  // the page loads must not reach it with the old fields and the new version:
  // that edit would then overwrite the other one unseen.
  test("reads a refund row's fields and its version together", async () => {
    const fixture = await buildMovementsFixture();
    const refund = fixture.refunds[0]!;
    const readBalances = availableBalance.readAvailableBalances;
    vi.spyOn(availableBalance, "readAvailableBalances").mockImplementationOnce(
      async (...args) => {
        await db
          .update(refunds)
          .set({
            amount: refund.amount - 100,
            updatedAt: new Date(refund.updatedAt.getTime() + 1000),
          })
          .where(eq(refunds.id, refund.id));

        return await readBalances(...args);
      },
    );

    const loaderData = await loadMovementsList(await listRequest());

    expect(loaderData.rows.find((row) => row.id === refund.id)).toMatchObject({
      amount: refund.amount,
      version: refund.updatedAt.toISOString(),
    });
  });

  test("states the zero position of an event with no movements", async () => {
    await createSavedEvent();

    const loaderData = await loadMovementsList(await listRequest());

    expect(loaderData.hasAnyMovement).toBe(false);
    expect(loaderData.summary).toEqual({
      availableAmount: 0,
      netAmount: 0,
      paymentsAmount: 0,
      refundsAmount: 0,
    });
  });
});

describe("correcting a refund from the admin movements list", () => {
  test("edits and deletes a refund with the owner tab's rules", async () => {
    const fixture = await buildMovementsFixture();
    const refund = fixture.refunds[1]!;
    const edit = new FormData();
    edit.set("intent", "update-refund");
    edit.set("refundId", refund.id);
    edit.set("version", refund.updatedAt.toISOString());
    edit.set("refundDate", refund.refundDate);
    edit.set("refundMethod", refund.refundMethod);
    // 2000 free plus its own 2000 is the cap.
    edit.set("amount", "4001");

    await expect(postAction(edit, "admin")).resolves.toMatchObject({
      status: "error",
    });

    edit.set("amount", "4000");
    await expect(postAction(edit, "admin")).resolves.toMatchObject({
      message: "Reembolso guardado.",
      status: "success",
    });

    const [saved] = await db
      .select()
      .from(refunds)
      .where(eq(refunds.id, refund.id));
    const remove = new FormData();
    remove.set("intent", "delete-refund");
    remove.set("refundId", refund.id);
    remove.set("version", saved!.updatedAt.toISOString());

    await expect(postAction(remove, "admin")).resolves.toMatchObject({
      message: "Reembolso eliminado.",
      status: "success",
    });
    expect(
      (await loadMovementsList(await listRequest())).summary.refundsAmount,
    ).toBe(4000);
  });

  test("refuses the auditor, who reads the list", async () => {
    const fixture = await buildMovementsFixture();
    const remove = new FormData();
    remove.set("intent", "delete-refund");
    remove.set("refundId", fixture.refunds[0]!.id);
    remove.set("version", fixture.refunds[0]!.updatedAt.toISOString());

    await expect(postAction(remove, "auditor")).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      loadMovementsList(await listRequest("", "auditor")),
    ).resolves.toMatchObject({ canWrite: false, totalCount: 5 });
  });

  test("refuses an intent the list does not hold", async () => {
    const form = new FormData();
    form.set("intent", "create-movement");

    await expect(postAction(form, "admin")).resolves.toMatchObject({
      status: "error",
    });
  });
});

async function expectThrownRedirect(request: Request): Promise<Response> {
  try {
    await loadMovementsList(request);
  } catch (thrown) {
    if (thrown instanceof Response) {
      return thrown;
    }

    throw thrown;
  }

  throw new Error("Expected the movements list to redirect.");
}

async function buildPaymentsFixture() {
  return await buildPaymentsFixtureIn(await createSavedEvent());
}

/**
 * Three payments of one academy in `event`, drained oldest-first; with
 * `payments`, that many unallocated ones of 1000 instead, all dated in March.
 */
async function buildPaymentsFixtureIn(
  event: Awaited<ReturnType<typeof createSavedEvent>>,
  options: { payments?: number } = {},
) {
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Pagos",
      choreographyName: "Aire",
      email: `${crypto.randomUUID()}@example.com`,
      event,
    });
  const pool = { academyId: academy.academy.id, eventId: event.id };

  if (options.payments !== undefined) {
    await db.insert(payments).values(
      Array.from({ length: options.payments }, (_, index) => ({
        ...pool,
        amount: 1000,
        paymentDate: "2026-03-01",
        paymentMethod: "transferencia" as const,
        paymentNumber: index + 1,
      })),
    );

    return pool;
  }

  const inscription = await insertInscription({
    academyId: academy.academy.id,
    choreographyId: choreography.id,
  });

  const inserted = await db
    .insert(payments)
    .values(
      [
        // 1 and 2 share the newer date, so date ordering has to beat number
        // ordering; 3 alone on the older date proves it can move a whole day
        // in front of both.
        { amount: 10000, paymentDate: "2026-03-16", paymentNumber: 1 },
        { amount: 8000, paymentDate: "2026-03-16", paymentNumber: 2 },
        { amount: 5000, paymentDate: "2026-03-15", paymentNumber: 3 },
      ].map((payment) => ({
        ...payment,
        ...pool,
        paymentMethod: "transferencia" as const,
      })),
    )
    .returning();

  const byNumber = new Map(
    inserted.map((payment) => [payment.paymentNumber, payment]),
  );

  // Oldest-first, which is how the pool draws: the first payment is spent whole
  // and the second is only partly drawn.
  await db.insert(paymentAllocations).values([
    {
      academyId: academy.academy.id,
      amount: 10000,
      eventId: event.id,
      choreographyInscriptionId: inscription.id,
      paymentId: byNumber.get(1)!.id,
    },
    {
      academyId: academy.academy.id,
      amount: 5000,
      eventId: event.id,
      choreographyInscriptionId: inscription.id,
      paymentId: byNumber.get(2)!.id,
    },
  ]);

  return pool;
}

/**
 * Refunds straight into the table, each with its own recording time so a
 * day's order is the test's and not the clock's. Their total draws on the
 * payments newest number first, as the pool reads it.
 */
async function insertRefunds(
  pool: { academyId: string; eventId: string },
  values: {
    amount: number;
    createdAt: string;
    internalNote?: string;
    refundDate: string;
    refundMethod?: "efectivo" | "transferencia";
    refundNumber: number;
  }[],
) {
  return await db
    .insert(refunds)
    .values(
      values.map((refund) => ({
        ...refund,
        ...pool,
        createdAt: new Date(refund.createdAt),
        refundMethod: refund.refundMethod ?? ("transferencia" as const),
        updatedAt: new Date(refund.createdAt),
      })),
    )
    .returning();
}

/**
 * The payments fixture with 6000 refunded: 4000 on the newest date and 2000
 * on the oldest, recorded after the payments that share its day.
 */
async function buildMovementsFixture() {
  const pool = await buildPaymentsFixture();
  const inserted = await insertRefunds(pool, [
    {
      amount: 4000,
      createdAt: "2099-03-17T12:00:00Z",
      internalNote: "Devuelto por error de carga",
      refundDate: "2026-03-17",
      refundMethod: "efectivo",
      refundNumber: 1,
    },
    {
      amount: 2000,
      createdAt: "2099-03-15T23:00:00Z",
      refundDate: "2026-03-15",
      refundNumber: 2,
    },
  ]);

  return { ...pool, refunds: inserted };
}

async function insertInscription(input: {
  academyId: string;
  choreographyId: string;
}) {
  const dancer = await createDancer(input.academyId, {
    firstName: "Ana",
    lastName: "López",
  });

  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: input.choreographyId,
      dancerId: dancer.id,
    })
    .returning();

  return inscription;
}

async function listRequest(
  search = "",
  role: "admin" | "auditor" = "admin",
): Promise<Request> {
  const query = search.length > 0 ? `?${search}` : "";
  const { request } = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role,
    requestUrl: `http://localhost/administracion/movimientos${query}`,
  });

  return request;
}

async function postAction(formData: FormData, role: "admin" | "auditor") {
  const { request } = await createSignedInRequest({
    body: formData,
    email: `${crypto.randomUUID()}@example.com`,
    role,
    requestUrl: "http://localhost/administracion/movimientos",
  });

  return await handleMovementsListAction(request);
}

type MovementsList = Awaited<ReturnType<typeof loadMovementsList>>;

function movementKeys(loaderData: MovementsList) {
  return loaderData.rows.map((row) => `${row.kind}:${row.number}`);
}

function rowsByNumber(
  loaderData: MovementsList,
): Record<number, { amount: number; availableAmount: number }> {
  return Object.fromEntries(
    loaderData.rows
      .flatMap((row) => (row.kind === "payment" ? [row] : []))
      .sort((left, right) => left.number - right.number)
      .map((row) => [
        row.number,
        { amount: row.amount, availableAmount: row.availableAmount },
      ]),
  );
}
