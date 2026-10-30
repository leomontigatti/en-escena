import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { refunds } from "@/db/schema";
import {
  academyFinancesRouteArgs,
  academyFinancesUrl,
  seedOwnerPoolForTest,
} from "@/lib/admin/finances/finances.test-support";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import { expectFlashRedirect } from "@/lib/shared/flash-notification.test-support";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createSavedEvent } from "@/lib/test-support/events";
import { createIndividualUser } from "@/lib/test-support/individuals";
import { registerRefundForTest } from "@/lib/test-support/refunds";
import { loader as academyFinancesLoader } from "@/routes/administracion.finanzas_.$academyId";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { handleRefundDetailAction, loadRefundDetail } from "./server";
import { deleteRefundIntent, updateRefundIntent } from "./shared";

installDatabaseTestHooks();

beforeEach(() => {
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    "2026-04-10",
  );
});

const refundUrl = (id: string) =>
  `http://localhost/administracion/movimientos/reembolsos/${id}`;

async function seedRefund() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academyId } = await seedOwnerPoolForTest({
    academyName: "Academia Reembolsos",
    event,
    fundedAmount: 0,
    paymentAmounts: [3000],
  });
  const { refundId } = await registerRefundForTest({
    academyId,
    amount: 1000,
    eventId: event.id,
  });

  return { academyId, eventId: event.id, refund: await readRefund(refundId) };
}

async function readRefund(refundId: string) {
  const [refund] = await db
    .select()
    .from(refunds)
    .where(eq(refunds.id, refundId));

  if (!refund) {
    throw new Error("Expected the refund to exist.");
  }

  return { ...refund, version: refund.updatedAt.toISOString() };
}

function editForm(
  refund: Awaited<ReturnType<typeof readRefund>>,
  fields: {
    academyId?: string;
    amount?: string;
    eventId?: string;
    paymentDate?: string;
    version?: string;
  } = {},
) {
  const formData = new FormData();
  formData.set("intent", updateRefundIntent);
  formData.set("version", fields.version ?? refund.version);
  formData.set("academyId", fields.academyId ?? refund.academyId);
  formData.set("amount", fields.amount ?? String(refund.amount));
  formData.set("paymentDate", fields.paymentDate ?? refund.refundDate);
  formData.set("paymentMethod", refund.refundMethod);
  formData.set("reference", "TRX-R2");
  formData.set("internalNote", "Corregido");
  if (fields.eventId) {
    formData.set("eventId", fields.eventId);
  }

  return formData;
}

function deleteForm(version: string) {
  const formData = new FormData();
  formData.set("intent", deleteRefundIntent);
  formData.set("version", version);

  return formData;
}

async function post(
  refundId: string,
  body: FormData,
  role: "admin" | "auditor" = "admin",
) {
  const { request } = await createSignedInRequest({
    body,
    email: `${crypto.randomUUID()}@example.com`,
    requestUrl: refundUrl(refundId),
    role,
  });

  return await handleRefundDetailAction(request, refundId);
}

async function read(refundId: string, role: "admin" | "auditor" = "admin") {
  const { request } = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    requestUrl: refundUrl(refundId),
    role,
  });

  return await loadRefundDetail(request, refundId);
}

async function readBalance(academyId: string, eventId: string) {
  const { request } = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    requestUrl: academyFinancesUrl(academyId, eventId),
    role: "admin",
  });
  const page = await academyFinancesLoader(
    academyFinancesRouteArgs(request, academyId),
  );

  return page.summary.availableBalanceAmount;
}

describe("a refund's page", () => {
  test("hands the form what the refund holds, with the version it saves against", async () => {
    const { academyId, refund } = await seedRefund();

    await expect(read(refund.id)).resolves.toMatchObject({
      canWrite: true,
      refund: { academyName: "Academia Reembolsos", id: refund.id },
      values: {
        academyId,
        amount: "1000",
        paymentDate: refund.refundDate,
        paymentMethod: refund.refundMethod,
      },
      version: refund.version,
    });
  });

  test("reads for the auditor, who can write nothing", async () => {
    const { refund } = await seedRefund();

    await expect(read(refund.id, "auditor")).resolves.toMatchObject({
      canWrite: false,
    });
  });

  test("answers 404 for a refund that does not exist", async () => {
    await createSavedEvent();

    await expect(read("missing")).rejects.toMatchObject({ status: 404 });
  });
});

describe("correcting a refund", () => {
  test("saves an edit up to the `Saldo disponible` plus the refund's own amount", async () => {
    const { refund } = await seedRefund();

    await expect(
      post(refund.id, editForm(refund, { amount: "3001" })),
    ).resolves.toMatchObject({
      fieldErrors: {},
      message:
        "El reembolso no puede superar $ 3.000, el saldo disponible más su monto actual.",
      status: "error",
      values: { amount: "3001" },
    });

    await expect(
      post(refund.id, editForm(refund, { amount: "3000" })),
    ).resolves.toEqual({
      intent: updateRefundIntent,
      message: "Reembolso guardado.",
      status: "success",
    });
    await expect(readRefund(refund.id)).resolves.toMatchObject({
      amount: 3000,
      internalNote: "Corregido",
      reference: "TRX-R2",
    });
  });

  test("refuses a future date and keeps academy and event whatever the form sends", async () => {
    const { academyId, eventId, refund } = await seedRefund();
    const other = await createAcademyUser({
      academyName: "Academia Ajena",
      email: `${crypto.randomUUID()}@example.com`,
    });

    await expect(
      post(refund.id, editForm(refund, { paymentDate: "2026-04-11" })),
    ).resolves.toMatchObject({
      fieldErrors: { paymentDate: "La fecha no puede ser futura." },
      status: "error",
    });

    await post(
      refund.id,
      editForm(refund, { academyId: other.academy.id, eventId: "other" }),
    );

    await expect(readRefund(refund.id)).resolves.toMatchObject({
      academyId,
      eventId,
    });
  });

  test("answers an edit over a refund changed meanwhile without its values, so the form takes the fresh ones", async () => {
    const { refund } = await seedRefund();
    await post(refund.id, editForm(refund, { amount: "900" }));

    const answer = await post(refund.id, editForm(refund, { amount: "500" }));

    expect(answer).toMatchObject({
      message:
        "El reembolso cambió mientras se guardaba. Revisalo y volvé a intentarlo.",
      status: "error",
    });
    expect(answer).not.toHaveProperty("values");
    await expect(readRefund(refund.id)).resolves.toMatchObject({ amount: 900 });
  });

  test("deletes it, raising the `Saldo disponible` by its amount, and returns to the list", async () => {
    const { academyId, eventId, refund } = await seedRefund();
    const before = await readBalance(academyId, eventId);

    const thrown = await post(refund.id, deleteForm(refund.version)).catch(
      (response: unknown) => response,
    );

    await expectFlashRedirect(
      thrown as Response,
      "/administracion/movimientos",
      {
        id: "route-notification:refund-deleted",
        message: "Reembolso eliminado.",
        variant: "success",
      },
    );
    await expect(readBalance(academyId, eventId)).resolves.toBe(before + 1000);
  });

  test("refuses a deletion over a refund changed meanwhile", async () => {
    const { refund } = await seedRefund();
    await post(refund.id, editForm(refund, { amount: "900" }));

    await expect(
      post(refund.id, deleteForm(refund.version)),
    ).resolves.toMatchObject({ status: "error" });
    await expect(readRefund(refund.id)).resolves.toMatchObject({ amount: 900 });
  });

  test("refuses the auditor, an academy and an individual every correction", async () => {
    const { refund } = await seedRefund();
    const academy = await createAcademyUser({
      academyName: "Academia Portal",
      email: `${crypto.randomUUID()}@example.com`,
    });
    const individual = await createIndividualUser({
      email: `${crypto.randomUUID()}@example.com`,
    });

    await expect(
      post(refund.id, editForm(refund), "auditor"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      post(refund.id, deleteForm(refund.version), "auditor"),
    ).rejects.toMatchObject({ status: 403 });

    for (const cookie of [academy.cookie, individual.cookie]) {
      for (const body of [editForm(refund), deleteForm(refund.version)]) {
        await expect(
          handleRefundDetailAction(
            new Request(refundUrl(refund.id), {
              body,
              headers: { cookie },
              method: "POST",
            }),
            refund.id,
          ),
        ).rejects.toMatchObject({ status: 403 });
      }
    }
    await expect(readRefund(refund.id)).resolves.toMatchObject({
      amount: 1000,
    });
  });
});
