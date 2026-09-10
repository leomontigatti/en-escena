import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { payments } from "@/db/schema";
import {
  createAcademyRecord,
  createAcademySession,
} from "@/features/portal/test-support/db";
import { loadPortalAcademyPayments } from "@/features/portal/payments/list/server";
import { activateEvent, updateEvent } from "@/lib/events/management.server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";
import { createSavedEvent } from "../../../../lib/admin/finances/finances.test-support";

installDatabaseTestHooks();

async function seedPayment(input: {
  academyId: string;
  amount: number;
  eventId: string;
  internalNote?: string;
  paymentDate: string;
  paymentNumber: number;
  reference?: string;
}) {
  const [payment] = await db
    .insert(payments)
    .values({
      academyId: input.academyId,
      amount: input.amount,
      eventId: input.eventId,
      internalNote: input.internalNote ?? null,
      paymentDate: input.paymentDate,
      paymentMethod: "transferencia",
      paymentNumber: input.paymentNumber,
      reference: input.reference ?? null,
    })
    .returning();

  if (!payment) {
    throw new Error("Expected payment to be created.");
  }

  return payment;
}

describe.sequential("loadPortalAcademyPayments", () => {
  test("lists only the academy's payments, without the internal note", async () => {
    const owner = await createAcademySession({
      email: "portal.pagos.owner@example.com",
      academyName: "Academia Portal",
    });
    const otherAcademy = await createAcademyRecord({
      email: "portal.pagos.other@example.com",
      academyName: "Academia Ajena",
    });
    const event = await createSavedEvent();
    await activateEvent(event.id);

    await seedPayment({
      academyId: owner.academyId,
      amount: 15000,
      eventId: event.id,
      internalNote: "Nota interna admin",
      paymentDate: "2026-03-15",
      paymentNumber: 1,
      reference: "TRX-PORTAL-001",
    });
    await seedPayment({
      academyId: otherAcademy.id,
      amount: 9999,
      eventId: event.id,
      paymentDate: "2026-03-17",
      paymentNumber: 3,
      reference: "TRX-AJENA",
    });

    const loaderData = await loadPortalAcademyPayments(
      new Request("http://localhost/portal/pagos", {
        headers: { cookie: owner.cookie },
      }),
    );

    expect(loaderData.payments).toHaveLength(1);
    expect(loaderData.payments[0]).toMatchObject({
      paymentNumber: 1,
      paymentMethod: "transferencia",
      reference: "TRX-PORTAL-001",
      amount: 15000,
    });
    expect(loaderData.payments[0]).not.toHaveProperty("internalNote");
  });

  test("lists the academy's payments newest first", async () => {
    const owner = await createAcademySession({
      email: "portal.pagos.orden@example.com",
      academyName: "Academia Portal",
    });
    const event = await createSavedEvent();
    await activateEvent(event.id);

    await seedPayment({
      academyId: owner.academyId,
      amount: 5000,
      eventId: event.id,
      paymentDate: "2026-03-10",
      paymentNumber: 1,
    });
    await seedPayment({
      academyId: owner.academyId,
      amount: 8000,
      eventId: event.id,
      paymentDate: "2026-03-20",
      paymentNumber: 2,
    });

    const loaderData = await loadPortalAcademyPayments(
      new Request("http://localhost/portal/pagos", {
        headers: { cookie: owner.cookie },
      }),
    );

    expect(loaderData.payments.map((payment) => payment.paymentNumber)).toEqual(
      [2, 1],
    );
  });

  test("returns the active event's payment instructions as one object", async () => {
    const owner = await createAcademySession({
      email: "portal.pagos.instrucciones@example.com",
      academyName: "Academia Portal",
    });
    const event = await createSavedEvent();
    await activateEvent(event.id);
    await loadPaymentInstructions(event, {
      paymentInstructionsCbu: "0070099330004512345678",
      paymentInstructionsAlias: "mi.alias-01",
      paymentInstructionsHolderName: "En Escena Producciones SRL",
      paymentInstructionsBankName: "Banco Galicia",
      paymentInstructionsHolderCuit: "30-71234567-1",
      paymentInstructionsText: "Poné el nombre de tu academia.",
    });

    const loaderData = await loadPortalAcademyPayments(
      portalPaymentsRequest(owner.cookie),
    );

    expect(loaderData.paymentInstructions).toEqual({
      cbu: "0070099330004512345678",
      alias: "mi.alias-01",
      holderName: "En Escena Producciones SRL",
      bankName: "Banco Galicia",
      holderCuit: "30-71234567-1",
      text: "Poné el nombre de tu academia.",
    });
  });

  test("returns the instructions when only the free text is loaded", async () => {
    const owner = await createAcademySession({
      email: "portal.pagos.solo-texto@example.com",
      academyName: "Academia Portal",
    });
    const event = await createSavedEvent();
    await activateEvent(event.id);
    await loadPaymentInstructions(event, {
      paymentInstructionsText: "Escribinos y te pasamos los datos.",
    });

    const loaderData = await loadPortalAcademyPayments(
      portalPaymentsRequest(owner.cookie),
    );

    expect(loaderData.paymentInstructions).toMatchObject({
      cbu: null,
      text: "Escribinos y te pasamos los datos.",
    });
  });

  test("returns no instructions when nothing is loaded", async () => {
    const owner = await createAcademySession({
      email: "portal.pagos.sin-instrucciones@example.com",
      academyName: "Academia Portal",
    });
    const event = await createSavedEvent();
    await activateEvent(event.id);

    const loaderData = await loadPortalAcademyPayments(
      portalPaymentsRequest(owner.cookie),
    );

    expect(loaderData.paymentInstructions).toBeNull();
  });

  test("returns no instructions when there is no active event", async () => {
    const owner = await createAcademySession({
      email: "portal.pagos.sin-evento@example.com",
      academyName: "Academia Portal",
    });

    const loaderData = await loadPortalAcademyPayments(
      portalPaymentsRequest(owner.cookie),
    );

    expect(loaderData).toMatchObject({
      activeEvent: null,
      paymentInstructions: null,
      payments: [],
    });
  });
});

/**
 * `createEvent` never writes the instructions — a new event starts empty — so
 * the admin's single-save path is what loads them.
 */
async function loadPaymentInstructions(
  event: Awaited<ReturnType<typeof createSavedEvent>>,
  instructions: Partial<Parameters<typeof updateEvent>[1]>,
) {
  const result = await updateEvent(event.id, {
    name: event.name,
    requiredDepositPercentage: event.requiredDepositPercentage,
    registrationStartsAt: event.registrationStartsAt,
    registrationEndsAt: event.registrationEndsAt,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    ...instructions,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }
}

function portalPaymentsRequest(cookie: string) {
  return new Request("http://localhost/portal/pagos", {
    headers: { cookie },
  });
}
