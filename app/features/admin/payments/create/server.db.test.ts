import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { payments } from "@/db/schema";
import { expectFlashRedirect } from "@/lib/shared/flash-notification.test-support";

import {
  buildGlobalPaymentRequest,
  createAcademyUser,
  createSavedEvent,
} from "@/lib/admin/academies/account-current-route.test-support";
import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { handleAdminPaymentCreateAction } from "./server";

installDatabaseTestHooks();

describe.sequential("admin payment create", () => {
  test("registers a payment and redirects to its detail with a flash toast", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.pago.nuevo@example.com",
      academyName: "Academia Pago Nuevo",
    });
    const { request } = await buildGlobalPaymentRequest({
      academyId: academy.academy.id,
      amount: "5000",
      internalNote: "Seña inicial",
      paymentDate: "2026-03-15",
      paymentMethod: "transferencia",
      reference: "TRX-100",
      requestUrl: "http://localhost/administracion/pagos/nuevo",
      role: "admin",
    });

    const response = await expectThrownFlashRedirect(request);

    const payment = await db.query.payments.findFirst({
      where: eq(payments.academyId, academy.academy.id),
    });

    expect(payment).toMatchObject({
      eventId: event.id,
      academyId: academy.academy.id,
    });
    await expectFlashRedirect(
      response,
      `/administracion/pagos/${payment?.id}`,
      {
        id: "route-notification:pago-registrado",
        message: "Pago registrado.",
        variant: "success",
      },
    );
  });
});

async function expectThrownFlashRedirect(request: Request): Promise<Response> {
  try {
    await handleAdminPaymentCreateAction(request);
  } catch (thrown) {
    if (thrown instanceof Response) {
      return thrown;
    }

    throw thrown;
  }

  throw new Error("Expected the payment create action to throw a redirect.");
}
