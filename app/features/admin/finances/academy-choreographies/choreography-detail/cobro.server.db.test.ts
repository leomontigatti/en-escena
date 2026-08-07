import { and, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  payments,
  choreographyDancers,
  paymentAllocations,
  prices,
} from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import {
  readInscriptionDepositOptions,
  releaseInscriptionAllocations,
} from "@/lib/finances/choreography-cobro.server";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import { action as choreographyDetailAction } from "@/routes/administracion.finanzas_.$academyId_.coreografias_.$choreographyId";

import { installDatabaseTestHooks } from "../../../../../../tests/db/harness";
import {
  createAcademyFinanceChoreographyFixture,
  createSavedEvent,
  createSignedInRequest,
  registerPaymentForTest,
} from "../../../../../lib/admin/finances/finances.test-support";

installDatabaseTestHooks();

// El cobro ya no se fecha contra un pago: congela contra el día del negocio y
// resuelve el precio vigente ese día. Fijarlo dentro de la vigencia del catálogo
// mantiene el fixture legible y hace determinista la fila de precio elegida.
beforeEach(() => {
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    "2026-04-10",
  );
});

async function seedCobroFixture() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Cobro",
      email: `cobro.${crypto.randomUUID()}@example.com`,
      choreographyName: "Cobro coreografía",
      event,
    });
  const dancerA = await createDancer(academy.academy.id, {
    firstName: "Ana",
    lastName: "Alonso",
  });
  const dancerB = await createDancer(academy.academy.id, {
    firstName: "Bruno",
    lastName: "Benítez",
  });

  await db.insert(choreographyDancers).values([
    {
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancerA.id,
    },
    {
      ageAtEventStart: 15,
      choreographyId: choreography.id,
      dancerId: dancerB.id,
    },
  ]);

  await registerPaymentForTest({
    academyId: academy.academy.id,
    amount: "50000",
    eventId: event.id,
    paymentDate: "2026-04-10",
  });
  const payment = await db.query.payments.findFirst({
    where: eq(payments.academyId, academy.academy.id),
  });
  if (!payment) {
    throw new Error("Expected a registered payment.");
  }

  return { academy, choreography, event, payment };
}

/**
 * Coreografía mixta: `Ana` queda `señada` a mano (piso = su precio congelado) y
 * `Bruno` sigue `impaga` como huérfana. Agrega dos filas de precio generales
 * para el mismo tipo de grupo: una por encima del piso y otra por debajo.
 */
async function seedMixedCobroFixture() {
  const fixture = await seedCobroFixture();

  const inscriptions = await db.query.choreographyDancers.findMany({
    where: eq(choreographyDancers.choreographyId, fixture.choreography.id),
    orderBy: (row, { asc }) => asc(row.ageAtEventStart),
  });
  const [ana, bruno] = inscriptions;
  if (!ana || !bruno) {
    throw new Error("Expected two inscriptions.");
  }

  await db
    .update(choreographyDancers)
    .set({
      frozenBasePriceAmount: 10000,
      depositReferenceDate: "2026-04-10",
      depositPercentage: 30,
      depositAmount: 3000,
    })
    .where(eq(choreographyDancers.id, ana.id));

  const [priceAbove] = await db
    .insert(prices)
    .values({
      eventId: fixture.event.id,
      name: "Solo tardío",
      groupType: "solo",
      amount: 12000,
      paymentDeadline: "2026-04-30",
      scheduleId: null,
    })
    .returning();
  const [priceBelow] = await db
    .insert(prices)
    .values({
      eventId: fixture.event.id,
      name: "Solo temprano",
      groupType: "solo",
      amount: 8000,
      paymentDeadline: "2026-03-31",
      scheduleId: null,
    })
    .returning();

  return { ...fixture, ana, bruno, priceAbove, priceBelow };
}

/**
 * Coreografía mixta con saldo pendiente: `Ana` queda `pagada` (saldo congelado)
 * y `Bruno` sigue `señada` como huérfana. Distintos bailarines, así que no hay
 * `Descuento por bailarín` en juego (queda en 0).
 */
async function seedMixedBalanceFixture() {
  const fixture = await seedCobroFixture();

  const inscriptions = await db.query.choreographyDancers.findMany({
    where: eq(choreographyDancers.choreographyId, fixture.choreography.id),
    orderBy: (row, { asc }) => asc(row.ageAtEventStart),
  });
  const [ana, bruno] = inscriptions;
  if (!ana || !bruno) {
    throw new Error("Expected two inscriptions.");
  }

  // Ambas señadas al mismo precio congelado.
  await db
    .update(choreographyDancers)
    .set({
      frozenBasePriceAmount: 10000,
      depositReferenceDate: "2026-04-10",
      depositPercentage: 30,
      depositAmount: 3000,
    })
    .where(inArray(choreographyDancers.id, [ana.id, bruno.id]));

  // Ana ya pagada (saldo congelado); Bruno sigue señada como huérfana.
  await db
    .update(choreographyDancers)
    .set({
      balanceReferenceDate: "2026-04-10",
      appliedDancerDiscountPercentage: 0,
      appliedDancerDiscountAmount: 0,
      finalTotalAmount: 10000,
      balanceAmount: 7000,
      balanceCompletedAt: "2026-04-10",
    })
    .where(eq(choreographyDancers.id, ana.id));

  // El dinero que esos snapshots dicen tener: Ana con su total y Bruno con su
  // seña. Sin esto el cobro derivaría un adeudado que no se corresponde con lo
  // que la escalera declara, porque lo adeudado sale de las asignaciones.
  await db.insert(paymentAllocations).values([
    {
      academyId: fixture.academy.academy.id,
      amount: 10000,
      eventId: fixture.event.id,
      inscriptionId: ana.id,
      paymentId: fixture.payment.id,
    },
    {
      academyId: fixture.academy.academy.id,
      amount: 3000,
      eventId: fixture.event.id,
      inscriptionId: bruno.id,
      paymentId: fixture.payment.id,
    },
  ]);

  return { ...fixture, ana, bruno };
}

async function postDetailAction(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  fields: Record<string, string>;
}) {
  const requestUrl = `http://localhost/administracion/finanzas/${input.academyId}/coreografias/${input.choreographyId}?evento=${input.eventId}`;
  const signedIn = await createSignedInRequest({
    email: `admin.${crypto.randomUUID()}@example.com`,
    role: "admin",
    requestUrl,
  });
  const formData = new FormData();
  for (const [name, value] of Object.entries(input.fields)) {
    formData.set(name, value);
  }

  const request = new Request(requestUrl, {
    method: "POST",
    body: formData,
    headers: {
      cookie: signedIn.request.headers.get("cookie") ?? "",
    },
  });

  try {
    return await choreographyDetailAction({
      request,
      params: {
        academyId: input.academyId,
        choreographyId: input.choreographyId,
      },
      context: {},
    } as never);
  } catch (thrown) {
    // Los redirects se lanzan como `Response` (convención de React Router).
    if (thrown instanceof Response) {
      return thrown;
    }
    throw thrown;
  }
}

describe.sequential("choreography cobro through the route action", () => {
  test("Pagar seña freezes deposit snapshots and moves inscriptions to señada", async () => {
    const fixture = await seedCobroFixture();

    const response = await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-deposit" },
    });

    expect(response).toMatchObject({ status: 302 });

    const inscriptions = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, fixture.choreography.id),
    });
    expect(inscriptions).toHaveLength(2);
    for (const inscription of inscriptions) {
      expect(inscription.depositReferenceDate).toBe("2026-04-10");
      expect(inscription.depositAmount).toBe(3000);
      expect(inscription.frozenBasePriceAmount).toBe(10000);
      expect(inscription.balanceReferenceDate).toBeNull();
    }

    const allocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.paymentId, fixture.payment.id),
    });
    expect(allocations).toHaveLength(2);
    expect(allocations.every((a) => a.amount === 3000)).toBe(true);
  });

  test("rejects Pagar saldo when an inscription has no deposit", async () => {
    const fixture = await seedCobroFixture();

    const result = await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-balance" },
    });

    expect(result).toMatchObject({ status: "error" });
    const allocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.paymentId, fixture.payment.id),
    });
    expect(allocations).toHaveLength(0);
  });

  test("Pagar saldo freezes balance snapshots and moves inscriptions to pagada", async () => {
    const fixture = await seedCobroFixture();

    await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-deposit" },
    });
    const balanceResponse = await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-balance" },
    });

    expect(balanceResponse).toMatchObject({ status: 302 });

    const inscriptions = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, fixture.choreography.id),
    });
    for (const inscription of inscriptions) {
      expect(inscription.balanceReferenceDate).toBe("2026-04-10");
      expect(inscription.balanceAmount).toBe(7000);
      expect(inscription.finalTotalAmount).toBe(10000);
    }

    // Dos inscripciones, un pago: dos filas, cada una con la seña y el saldo
    // sumados encima.
    const allocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.paymentId, fixture.payment.id),
    });
    expect(allocations).toHaveLength(2);
    expect(allocations.every((a) => a.amount === 10000)).toBe(true);
  });

  test("la seña y el saldo del mismo pago viven en una sola asignación", async () => {
    const fixture = await seedCobroFixture();

    await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-deposit" },
    });
    await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-balance" },
    });

    const inscription = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.choreographyId, fixture.choreography.id),
    });
    if (!inscription) {
      throw new Error("Expected an inscription.");
    }

    // Una sola fila por (pago, inscripción): el saldo se sumó sobre la seña.
    const allocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.inscriptionId, inscription.id),
    });
    expect(allocations).toHaveLength(1);
    expect(allocations[0]?.amount).toBe(10000);
  });

  test("deshacer no tiene orden: la asignación se borra con la inscripción pagada", async () => {
    const fixture = await seedCobroFixture();

    await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-deposit" },
    });
    await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-balance" },
    });

    const allocation = await db.query.paymentAllocations.findFirst({
      where: eq(paymentAllocations.paymentId, fixture.payment.id),
    });
    if (!allocation) {
      throw new Error("Expected an allocation.");
    }

    const response = await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: {
        intent: "delete-allocation",
        allocationId: allocation.id,
      },
    });

    expect(response).toMatchObject({ status: 302 });
    const inscription = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, allocation.inscriptionId),
    });
    expect(inscription?.balanceReferenceDate).toBeNull();
    expect(inscription?.depositReferenceDate).toBeNull();
    const survivingAllocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.inscriptionId, allocation.inscriptionId),
    });
    expect(survivingAllocations).toHaveLength(0);
  });

  test("Cobrar seña de una huérfana congela solo su snapshot y la deja señada", async () => {
    const fixture = await seedMixedCobroFixture();

    const response = await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: {
        intent: "pay-inscription-deposit",
        inscriptionId: fixture.bruno.id,
        priceId: fixture.priceAbove.id,
      },
    });

    expect(response).toMatchObject({ status: 302 });

    const bruno = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, fixture.bruno.id),
    });
    expect(bruno?.frozenBasePriceAmount).toBe(12000);
    expect(bruno?.depositReferenceDate).toBe("2026-04-10");
    expect(bruno?.depositAmount).toBe(3600);
    expect(bruno?.selectedPriceId).toBe(fixture.priceAbove.id);

    // La hermana ya señada no se toca.
    const ana = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, fixture.ana.id),
    });
    expect(ana?.frozenBasePriceAmount).toBe(10000);
    expect(ana?.depositAmount).toBe(3000);

    const allocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.inscriptionId, fixture.bruno.id),
    });
    expect(allocations).toHaveLength(1);
    expect(allocations[0]?.amount).toBe(3600);
  });

  test("El server rechaza una fila de precio por debajo del piso", async () => {
    const fixture = await seedMixedCobroFixture();

    const result = await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: {
        intent: "pay-inscription-deposit",
        inscriptionId: fixture.bruno.id,
        priceId: fixture.priceBelow.id,
      },
    });

    expect(result).toMatchObject({ status: "error" });

    const bruno = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, fixture.bruno.id),
    });
    expect(bruno?.depositReferenceDate).toBeNull();
    const allocations = await db.query.paymentAllocations.findMany({
      where: and(
        eq(paymentAllocations.inscriptionId, fixture.bruno.id),
        eq(paymentAllocations.paymentId, fixture.payment.id),
      ),
    });
    expect(allocations).toHaveLength(0);
  });

  test("El server rechaza una fila de precio por encima del precio vigente hoy", async () => {
    const fixture = await seedMixedCobroFixture();

    // Techo: único precio con vencimiento aún no pasado, así queda como el
    // "precio vigente hoy" (11000). priceAbove (12000) está sobre el piso pero
    // por encima de este techo. Requiere correr el día del negocio más allá de
    // los vencimientos de 2026 del fixture.
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-06-01",
    );
    await db.insert(prices).values({
      eventId: fixture.event.id,
      name: "Solo vigente",
      groupType: "solo",
      amount: 11000,
      paymentDeadline: "2999-12-31",
      scheduleId: null,
    });

    const result = await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: {
        intent: "pay-inscription-deposit",
        inscriptionId: fixture.bruno.id,
        priceId: fixture.priceAbove.id,
      },
    });

    expect(result).toMatchObject({ status: "error" });

    const bruno = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, fixture.bruno.id),
    });
    expect(bruno?.depositReferenceDate).toBeNull();
    const allocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.inscriptionId, fixture.bruno.id),
    });
    expect(allocations).toHaveLength(0);
  });

  test("Ofrece el precio del piso cuando el precio vigente hoy quedó por debajo", async () => {
    const fixture = await seedMixedCobroFixture();

    // Precio vigente hoy (techo) por debajo del piso (10000): igualar el piso
    // debe seguir siendo válido, así que las opciones no pueden quedar vacías.
    // El día del negocio corre más allá de los vencimientos de 2026 del fixture
    // para que el techo sea uno de los dos precios que se agregan acá.
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-06-01",
    );
    await db.insert(prices).values([
      {
        eventId: fixture.event.id,
        name: "Solo barato vigente",
        groupType: "solo",
        amount: 8000,
        paymentDeadline: "2999-01-01",
        scheduleId: null,
      },
      {
        eventId: fixture.event.id,
        name: "Solo piso vigente",
        groupType: "solo",
        amount: 10000,
        paymentDeadline: "2999-12-31",
        scheduleId: null,
      },
    ]);

    const options = await readInscriptionDepositOptions({
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
    });

    expect(options?.floor).toBe(10000);
    // No queda vacío: el techo efectivo no baja del piso, así que se sigue
    // ofreciendo el precio del piso (10000) y nada por debajo ni por encima.
    expect(options?.priceRows.length).toBeGreaterThan(0);
    expect(options?.priceRows.every((row) => row.amount === 10000)).toBe(true);
  });

  test("Cobrar saldo de una huérfana señada congela su snapshot y la deja pagada", async () => {
    const fixture = await seedMixedBalanceFixture();

    const response = await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: {
        intent: "pay-inscription-balance",
        inscriptionId: fixture.bruno.id,
      },
    });

    expect(response).toMatchObject({ status: 302 });

    const bruno = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, fixture.bruno.id),
    });
    expect(bruno?.balanceReferenceDate).toBe("2026-04-10");
    expect(bruno?.balanceAmount).toBe(7000);
    expect(bruno?.finalTotalAmount).toBe(10000);
    expect(bruno?.balanceCompletedAt).toBe("2026-04-10");

    // La hermana ya pagada no se toca.
    const ana = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, fixture.ana.id),
    });
    expect(ana?.balanceAmount).toBe(7000);

    // Una sola fila por (pago, inscripción): el saldo (7000) se sumó sobre la
    // seña que Bruno ya tenía asignada (3000).
    const allocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.inscriptionId, fixture.bruno.id),
    });
    expect(allocations).toHaveLength(1);
    expect(allocations[0]?.amount).toBe(10000);
  });

  test("El server rechaza cobrar saldo por inscripción cuando no está señada", async () => {
    const fixture = await seedMixedBalanceFixture();

    // Ana ya está pagada: intentar cobrar su saldo de nuevo debe fallar.
    const result = await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: {
        intent: "pay-inscription-balance",
        inscriptionId: fixture.ana.id,
      },
    });

    expect(result).toMatchObject({ status: "error" });
  });

  test("releaseInscriptionAllocations returns everything allocated to the available balance", async () => {
    const fixture = await seedCobroFixture();

    await postDetailAction({
      academyId: fixture.academy.academy.id,
      choreographyId: fixture.choreography.id,
      eventId: fixture.event.id,
      fields: { intent: "pay-deposit" },
    });

    const inscription = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.choreographyId, fixture.choreography.id),
    });
    if (!inscription) {
      throw new Error("Expected an inscription.");
    }

    const { releasedAmount } = await releaseInscriptionAllocations({
      inscriptionId: inscription.id,
    });

    expect(releasedAmount).toBe(3000);
    const remaining = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.inscriptionId, inscription.id),
    });
    expect(remaining).toHaveLength(0);

    const reloaded = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, inscription.id),
    });
    expect(reloaded?.depositReferenceDate).toBeNull();
    expect(reloaded?.depositAmount).toBeNull();
  });
});
