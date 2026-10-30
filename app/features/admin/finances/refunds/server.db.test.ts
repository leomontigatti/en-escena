import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { refunds } from "@/db/schema";
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

import { deleteRefundIntent, updateRefundIntent } from "./shared";

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
