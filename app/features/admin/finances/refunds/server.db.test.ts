import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { events, refunds } from "@/db/schema";
import {
  academyFinancesRouteArgs,
  academyFinancesUrl,
  seedOwnerPoolForTest,
} from "@/lib/admin/finances/finances.test-support";
import { registerRefundForTest } from "@/lib/test-support/refunds";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSavedEvent } from "@/lib/test-support/events";
import { createIndividualUser } from "@/lib/test-support/individuals";
import {
  action as academyFinancesAction,
  loader as academyFinancesLoader,
} from "@/routes/administracion.finanzas_.$academyId";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import {
  deleteRefundIntent,
  registerRefundIntent,
  updateRefundIntent,
} from "./shared";

installDatabaseTestHooks();

beforeEach(() => {
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    "2026-04-10",
  );
});

type RefundFields = {
  amount?: string;
  refundDate?: string;
  refundMethod?: string;
};

function refundFormData(fields: RefundFields = {}) {
  const formData = new FormData();
  formData.set("intent", registerRefundIntent);
  formData.set("amount", fields.amount ?? "1000");
  formData.set("refundDate", fields.refundDate ?? "2026-04-09");
  formData.set("refundMethod", fields.refundMethod ?? "efectivo");
  formData.set("reference", "TRX-R1");
  formData.set("internalNote", "Se retiró");

  return formData;
}

function postWithCookie(input: {
  academyId: string;
  cookie: string;
  eventId: string;
  fields?: RefundFields;
}) {
  return new Request(academyFinancesUrl(input.academyId, input.eventId), {
    body: refundFormData(input.fields),
    headers: { cookie: input.cookie },
    method: "POST",
  });
}

async function postAs(input: {
  academyId: string;
  eventId: string;
  fields?: RefundFields;
  role: "admin" | "auditor";
}) {
  const { request } = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: input.role,
  });

  return postWithCookie({
    ...input,
    cookie: request.headers.get("cookie") ?? "",
  });
}

async function readRefunds(academyId: string) {
  return await db
    .select()
    .from(refunds)
    .where(eq(refunds.academyId, academyId));
}

async function seedPool() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academyId } = await seedOwnerPoolForTest({
    academyName: "Academia Reembolsos",
    event,
    fundedAmount: 0,
    paymentAmounts: [3000],
  });

  return { academyId, eventId: event.id };
}

describe("registering a refund from the owner's finance page", () => {
  test("saves the refund against the active event and answers in place", async () => {
    const pool = await seedPool();

    await expect(
      academyFinancesAction(
        academyFinancesRouteArgs(
          await postAs({ ...pool, role: "admin", fields: { amount: "3000" } }),
          pool.academyId,
        ),
      ),
    ).resolves.toEqual({
      intent: registerRefundIntent,
      message: "Reembolso registrado.",
      status: "success",
    });
    await expect(readRefunds(pool.academyId)).resolves.toMatchObject([
      {
        amount: 3000,
        eventId: pool.eventId,
        internalNote: "Se retiró",
        reference: "TRX-R1",
        refundDate: "2026-04-09",
        refundMethod: "efectivo",
        refundNumber: 1,
      },
    ]);
  });

  test("moves nothing but the `Saldo disponible`: no inscription's money, status or billing", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academyId } = await seedOwnerPoolForTest({
      academyName: "Academia Intacta",
      event,
      fundedAmount: 3000,
      paymentAmounts: [5000],
    });
    const pool = { academyId, eventId: event.id };
    const readPage = async () => {
      const { request } = await createSignedInRequest({
        email: `${crypto.randomUUID()}@example.com`,
        requestUrl: academyFinancesUrl(academyId, event.id),
        role: "admin",
      });

      return await academyFinancesLoader(
        academyFinancesRouteArgs(request, academyId),
      );
    };
    const before = await readPage();

    await expect(
      academyFinancesAction(
        academyFinancesRouteArgs(
          await postAs({ ...pool, role: "admin", fields: { amount: "2000" } }),
          academyId,
        ),
      ),
    ).resolves.toMatchObject({ status: "success" });

    const after = await readPage();

    expect(after.choreographyFinanceRows).toEqual(
      before.choreographyFinanceRows,
    );
    expect(after.inscriptions).toEqual(before.inscriptions);
    expect(after.bulkEmission).toEqual(before.bulkEmission);
    expect(after.summary).toEqual({
      ...before.summary,
      availableBalanceAmount: before.summary.availableBalanceAmount - 2000,
    });
  });

  test("refuses a refund above the `Saldo disponible`", async () => {
    const pool = await seedPool();

    await expect(
      academyFinancesAction(
        academyFinancesRouteArgs(
          await postAs({ ...pool, role: "admin", fields: { amount: "3001" } }),
          pool.academyId,
        ),
      ),
    ).resolves.toEqual({
      intent: registerRefundIntent,
      message: "El reembolso no puede superar el saldo disponible de $ 3.000.",
      status: "error",
    });
    await expect(readRefunds(pool.academyId)).resolves.toEqual([]);
  });

  test("refuses a future date and an amount that is not whole pesos", async () => {
    const pool = await seedPool();

    for (const [fields, message] of [
      [
        { refundDate: "2026-04-11" },
        "La fecha del reembolso no puede ser futura.",
      ],
      [{ amount: "10.5" }, "Ingresá un monto entero en pesos, sin centavos."],
    ] as const) {
      await expect(
        academyFinancesAction(
          academyFinancesRouteArgs(
            await postAs({ ...pool, role: "admin", fields }),
            pool.academyId,
          ),
        ),
      ).resolves.toMatchObject({ message, status: "error" });
    }
    await expect(readRefunds(pool.academyId)).resolves.toEqual([]);
  });

  test("refuses to register without an active event", async () => {
    const pool = await seedPool();
    await db.update(events).set({ active: false });

    await expect(
      academyFinancesAction(
        academyFinancesRouteArgs(
          await postAs({ ...pool, role: "admin" }),
          pool.academyId,
        ),
      ),
    ).resolves.toMatchObject({
      message: "Activá un evento para registrar reembolsos.",
      status: "error",
    });
    await expect(readRefunds(pool.academyId)).resolves.toEqual([]);
  });

  test("refuses the auditor, an academy and an individual", async () => {
    const pool = await seedPool();
    const academy = await createAcademyUser({
      academyName: "Academia Portal",
      email: `${crypto.randomUUID()}@example.com`,
    });
    const individual = await createIndividualUser({
      email: `${crypto.randomUUID()}@example.com`,
    });

    await expect(
      academyFinancesAction(
        academyFinancesRouteArgs(
          await postAs({ ...pool, role: "auditor" }),
          pool.academyId,
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
    for (const cookie of [academy.cookie, individual.cookie]) {
      await expect(
        academyFinancesAction(
          academyFinancesRouteArgs(
            postWithCookie({ ...pool, cookie }),
            pool.academyId,
          ),
        ),
      ).rejects.toMatchObject({ status: 403 });
    }
    await expect(readRefunds(pool.academyId)).resolves.toEqual([]);
  });
});

async function readRefundVersion(refundId: string) {
  const [refund] = await db
    .select()
    .from(refunds)
    .where(eq(refunds.id, refundId));

  if (!refund) {
    throw new Error("Expected the refund to exist.");
  }

  return { ...refund, version: refund.updatedAt.toISOString() };
}

function correctionFormData(
  refund: Awaited<ReturnType<typeof readRefundVersion>>,
  intent: typeof updateRefundIntent | typeof deleteRefundIntent,
  fields: RefundFields & { academyId?: string; eventId?: string } = {},
) {
  const formData = new FormData();
  formData.set("intent", intent);
  formData.set("refundId", refund.id);
  formData.set("version", refund.version);
  formData.set("amount", fields.amount ?? String(refund.amount));
  formData.set("refundDate", fields.refundDate ?? refund.refundDate);
  formData.set("refundMethod", fields.refundMethod ?? refund.refundMethod);
  formData.set("reference", "TRX-R2");
  formData.set("internalNote", "Corregido");
  if (fields.academyId) {
    formData.set("academyId", fields.academyId);
  }
  if (fields.eventId) {
    formData.set("eventId", fields.eventId);
  }

  return formData;
}

async function postCorrection(input: {
  academyId: string;
  cookie?: string;
  eventId: string;
  formData: FormData;
  role?: "admin" | "auditor";
}) {
  const cookie =
    input.cookie ??
    (
      await createSignedInRequest({
        email: `${crypto.randomUUID()}@example.com`,
        role: input.role ?? "admin",
      })
    ).request.headers.get("cookie") ??
    "";

  return await academyFinancesAction(
    academyFinancesRouteArgs(
      new Request(academyFinancesUrl(input.academyId, input.eventId), {
        body: input.formData,
        headers: { cookie },
        method: "POST",
      }),
      input.academyId,
    ),
  );
}

async function seedRefundedPool() {
  const pool = await seedPool();
  const { refundId } = await registerRefundForTest({ ...pool, amount: 1000 });

  return { pool, refund: await readRefundVersion(refundId) };
}

describe("correcting a refund from the owner's finance page", () => {
  test("saves an edit up to the `Saldo disponible` plus the refund's own amount", async () => {
    const { pool, refund } = await seedRefundedPool();

    await expect(
      postCorrection({
        ...pool,
        formData: correctionFormData(refund, updateRefundIntent, {
          amount: "3001",
        }),
      }),
    ).resolves.toEqual({
      intent: updateRefundIntent,
      message:
        "El reembolso no puede superar $ 3.000, el saldo disponible más su monto actual.",
      status: "error",
    });
    await expect(
      postCorrection({
        ...pool,
        formData: correctionFormData(refund, updateRefundIntent, {
          amount: "3000",
          refundDate: "2026-04-10",
        }),
      }),
    ).resolves.toEqual({
      intent: updateRefundIntent,
      message: "Reembolso guardado.",
      status: "success",
    });
    await expect(readRefundVersion(refund.id)).resolves.toMatchObject({
      amount: 3000,
      internalNote: "Corregido",
      reference: "TRX-R2",
      refundDate: "2026-04-10",
    });
  });

  test("refuses a future date and keeps academy and event whatever the form sends", async () => {
    const { pool, refund } = await seedRefundedPool();
    const otherEvent = await createSavedEvent({
      active: false,
      requiredDepositPercentage: 30,
    });
    const other = await seedOwnerPoolForTest({
      academyName: "Academia Otra",
      event: otherEvent,
      fundedAmount: 0,
      paymentAmounts: [3000],
    });

    await expect(
      postCorrection({
        ...pool,
        formData: correctionFormData(refund, updateRefundIntent, {
          refundDate: "2026-04-11",
        }),
      }),
    ).resolves.toMatchObject({
      message: "La fecha del reembolso no puede ser futura.",
      status: "error",
    });
    await expect(
      postCorrection({
        ...pool,
        formData: correctionFormData(refund, updateRefundIntent, {
          academyId: other.academyId,
          amount: "500",
          eventId: otherEvent.id,
        }),
      }),
    ).resolves.toMatchObject({ status: "success" });
    await expect(readRefundVersion(refund.id)).resolves.toMatchObject({
      academyId: pool.academyId,
      amount: 500,
      eventId: pool.eventId,
    });
  });

  test("deletes a refund, raising the page's `Saldo disponible` by its amount", async () => {
    const { pool, refund } = await seedRefundedPool();
    const readBalance = async () => {
      const { request } = await createSignedInRequest({
        email: `${crypto.randomUUID()}@example.com`,
        requestUrl: academyFinancesUrl(pool.academyId, pool.eventId),
        role: "admin",
      });
      const page = await academyFinancesLoader(
        academyFinancesRouteArgs(request, pool.academyId),
      );

      return page.summary.availableBalanceAmount;
    };
    const before = await readBalance();

    await expect(
      postCorrection({
        ...pool,
        formData: correctionFormData(refund, deleteRefundIntent),
      }),
    ).resolves.toEqual({
      intent: deleteRefundIntent,
      message: "Reembolso eliminado.",
      status: "success",
    });
    await expect(readBalance()).resolves.toBe(before + 1000);
    await expect(readRefunds(pool.academyId)).resolves.toEqual([]);
  });

  test("refuses an edit or a deletion over a refund changed meanwhile", async () => {
    const { pool, refund } = await seedRefundedPool();
    await postCorrection({
      ...pool,
      formData: correctionFormData(refund, updateRefundIntent, {
        amount: "900",
      }),
    });

    for (const intent of [updateRefundIntent, deleteRefundIntent] as const) {
      await expect(
        postCorrection({
          ...pool,
          formData: correctionFormData(refund, intent, { amount: "700" }),
        }),
      ).resolves.toEqual({
        intent,
        message:
          "El reembolso cambió mientras se guardaba. Revisalo y volvé a intentarlo.",
        status: "error",
      });
    }
    await expect(readRefundVersion(refund.id)).resolves.toMatchObject({
      amount: 900,
    });
  });

  test("refuses the auditor, an academy and an individual every correction", async () => {
    const { pool, refund } = await seedRefundedPool();
    const academy = await createAcademyUser({
      academyName: "Academia Portal",
      email: `${crypto.randomUUID()}@example.com`,
    });
    const individual = await createIndividualUser({
      email: `${crypto.randomUUID()}@example.com`,
    });

    for (const intent of [updateRefundIntent, deleteRefundIntent] as const) {
      await expect(
        postCorrection({
          ...pool,
          formData: correctionFormData(refund, intent, { amount: "500" }),
          role: "auditor",
        }),
      ).rejects.toMatchObject({ status: 403 });
      for (const cookie of [academy.cookie, individual.cookie]) {
        await expect(
          postCorrection({
            ...pool,
            cookie,
            formData: correctionFormData(refund, intent, { amount: "500" }),
          }),
        ).rejects.toMatchObject({ status: 403 });
      }
    }
    await expect(readRefundVersion(refund.id)).resolves.toMatchObject({
      amount: 1000,
      version: refund.version,
    });
  });
});
