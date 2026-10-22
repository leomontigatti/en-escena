import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographyDancers, comprobantes } from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
} from "@/features/portal/choreographies/test-support/db";
import {
  emitComprobanteConfirmValue,
  emitComprobanteIntent,
} from "@/features/admin/finances/comprobante-emission/shared";
import { createAcademyFinanceChoreographyFixture } from "@/lib/admin/finances/finances.test-support";
import { choreographyAnchor } from "@/lib/comprobantes/anchor";
import type { ArcaBillingPort } from "@/lib/comprobantes/arca/client.server";
import {
  allocatePayment,
  approvingNumber,
  connectionLost,
  emissionDeps,
  fakeBilling,
} from "@/lib/comprobantes/comprobante-emission.test-support";
import { emitAnchorComprobante } from "@/lib/comprobantes/emit-comprobante.server";
import { insertTestPrices } from "@/lib/prices/price-rows.test-support";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createSavedEvent } from "@/lib/test-support/events";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { handleAcademyFinancesAction, loadAcademyFinances } from "./server";

installDatabaseTestHooks();

const ADMIN_EMAIL = "admin.emision.masiva@example.com";

/*
 * Bulk emission from the academy's finance list (#1712): the loader plans what
 * each choreography owes, off the emitter's own plan, and the list action
 * emits one choreography per request without leaving the list.
 */

// A second academy joins the first one's event: only one event is active.
async function seedAcademy(
  suffix: string,
  joining?: {
    catalog: Awaited<
      ReturnType<typeof createAcademyFinanceChoreographyFixture>
    >["catalog"];
    event: Awaited<ReturnType<typeof createSavedEvent>>;
  },
) {
  const event =
    joining?.event ??
    (await createSavedEvent({ requiredDepositPercentage: 30 }));
  const { academy, catalog, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: `Academia ${suffix}`,
      choreographyName: "Primera",
      email: `academia.${suffix}@example.com`,
      event,
      catalog: joining?.catalog,
    });
  // Every inscription costs 10000, with a 3000 deposit.
  if (!joining) {
    await insertTestPrices([
      {
        eventId: event.id,
        name: "Precio Solo vigente",
        groupType: "solo",
        amount: 10000,
        paymentDeadline: "2099-12-31",
      },
    ]);
  }
  const academyId = academy.academy.id;

  // A dancer on the choreography, holding `paid` of their 10000.
  async function enrol(choreographyId: string, paid: number) {
    const dancer = await createDancer(academyId);
    const [inscription] = await db
      .insert(choreographyDancers)
      .values({ ageAtEventStart: 14, choreographyId, dancerId: dancer.id })
      .returning();

    if (paid > 0) {
      await allocatePayment({
        academyId,
        eventId: event.id,
        inscriptionId: inscription.id,
        amount: paid,
      });
    }
  }

  async function addChoreography(name: string, paid: number) {
    const created = await createChoreographyRecord({
      academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name,
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await enrol(created.id, paid);

    return created.id;
  }

  async function invoice(choreographyId: string, billing: ArcaBillingPort) {
    await expect(
      emitAnchorComprobante(
        { anchor: choreographyAnchor(choreographyId), eventId: event.id },
        emissionDeps(billing),
      ),
    ).resolves.toMatchObject({ ok: true });
  }

  await enrol(choreography.id, 3000);

  return {
    academyId,
    addChoreography,
    catalog,
    enrol,
    event,
    eventId: event.id,
    invoice,
    firstId: choreography.id,
  };
}

async function signedIn(input: {
  academyId: string;
  eventId: string;
  formData?: Record<string, string>;
}) {
  const url = `http://localhost/administracion/finanzas/${input.academyId}?evento=${input.eventId}`;
  const { request } = await createSignedInRequest({
    email: ADMIN_EMAIL,
    role: "admin",
    requestUrl: url,
  });

  if (!input.formData) {
    return request;
  }

  return new Request(url, {
    method: "POST",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(input.formData),
  });
}

async function loadBulkEmission(input: { academyId: string; eventId: string }) {
  const data = await loadAcademyFinances({
    params: { academyId: input.academyId },
    request: await signedIn(input),
  });

  return data.bulkEmission;
}

function emitFormData(choreographyId: string, amount: number) {
  return {
    intent: emitComprobanteIntent,
    confirm: emitComprobanteConfirmValue,
    choreographyId,
    kind: "factura_c",
    amount: String(amount),
  };
}

// An authorization ARCA dropped, then a lookup that failed too: the attempt
// stays reserved and unverified, holding the invoice series.
function droppedConnection(): ArcaBillingPort {
  return fakeBilling({
    createVoucher: vi.fn(connectionLost),
    getVoucherInfo: vi.fn(connectionLost),
  });
}

describe("academy finance list — bulk emission plan", () => {
  test("plans what each choreography owes and says why the rest are left out", async () => {
    const academy = await seedAcademy("plan");
    const unpaid = await academy.addChoreography("Sin seña", 0);
    const invoiced = await academy.addChoreography("Facturada", 3000);
    const grown = await academy.addChoreography("Con alta", 3000);
    await academy.invoice(invoiced, approvingNumber(1));
    await academy.invoice(grown, approvingNumber(2));
    // A dancer added after the invoice: the choreography owes a debit note
    // for them, with no deposit gate.
    await academy.enrol(grown, 0);

    const bulk = await loadBulkEmission(academy);

    expect(bulk.plans).toEqual({
      [academy.firstId]: { status: "ready", kind: "factura_c", amount: 10000 },
      [unpaid]: {
        status: "skipped",
        reasons: ["Alguna inscripción todavía no cubrió su seña."],
      },
      [invoiced]: {
        status: "skipped",
        reasons: ["Lo facturado coincide con el total."],
      },
      [grown]: { status: "ready", kind: "nota_debito_c", amount: 10000 },
    });
    // The date is chosen against the series the plan emits in, and no other.
    expect(Object.keys(bulk.cbteFch.floors).sort()).toEqual([
      "factura_c",
      "nota_debito_c",
    ]);
    expect(bulk.blocked).toBeNull();
  });

  test("names the attempt that blocks emitting while a reservation is live", async () => {
    const academy = await seedAcademy("bloqueo");
    await expect(
      emitAnchorComprobante(
        {
          anchor: choreographyAnchor(academy.firstId),
          eventId: academy.eventId,
        },
        emissionDeps(droppedConnection()),
      ),
    ).resolves.toMatchObject({ ok: false, reason: "unverified" });

    const bulk = await loadBulkEmission(academy);

    expect(bulk.blocked?.reason).toContain("«Primera»");
  });
});

describe("academy finance list — emitting one choreography of the run", () => {
  test("emits and answers the number, staying on the list", async () => {
    const academy = await seedAcademy("emite");

    const result = await handleAcademyFinancesAction({
      params: { academyId: academy.academyId },
      request: await signedIn({
        ...academy,
        formData: emitFormData(academy.firstId, 10000),
      }),
      resolveEmissionDeps: () => emissionDeps(approvingNumber(7)),
    });

    expect(result).toEqual({
      status: "emitted",
      number: "0001-00000007",
      recovered: false,
    });
    await expect(
      db
        .select({ impTotal: comprobantes.impTotal })
        .from(comprobantes)
        .where(eq(comprobantes.choreographyId, academy.firstId)),
    ).resolves.toEqual([{ impTotal: 10000 }]);
  });

  test("answers the blocked series as the contingency that halts the run", async () => {
    const academy = await seedAcademy("serie");
    const second = await academy.addChoreography("Segunda", 3000);
    await emitAnchorComprobante(
      { anchor: choreographyAnchor(academy.firstId), eventId: academy.eventId },
      emissionDeps(droppedConnection()),
    );

    const result = await handleAcademyFinancesAction({
      params: { academyId: academy.academyId },
      request: await signedIn({
        ...academy,
        formData: emitFormData(second, 10000),
      }),
      resolveEmissionDeps: () => emissionDeps(approvingNumber(44)),
    });

    expect(result).toMatchObject({
      status: "warning",
      contingency: { status: "unverified", cbteTipo: 11 },
    });
  });

  test("refuses a choreography of another academy", async () => {
    const academy = await seedAcademy("propia");
    const other = await seedAcademy("ajena", academy);

    const result = await handleAcademyFinancesAction({
      params: { academyId: academy.academyId },
      request: await signedIn({
        ...academy,
        formData: emitFormData(other.firstId, 10000),
      }),
      resolveEmissionDeps: () => emissionDeps(approvingNumber(1)),
    });

    expect(result).toMatchObject({ status: "error" });
    await expect(
      db
        .select()
        .from(comprobantes)
        .where(eq(comprobantes.choreographyId, other.firstId)),
    ).resolves.toEqual([]);
  });
});
