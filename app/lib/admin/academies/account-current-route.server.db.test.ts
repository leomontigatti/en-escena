import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academies,
  academyEventChoreographyInvoices,
  academyEventPayments,
  user,
} from "@/db/schema";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import {
  AdministracionAcademiasRouteView,
  loader as academiesLoader,
} from "@/routes/administracion.academias";
import {
  action as accountCurrentAction,
  AdministracionAcademiaCuentaCorrienteRouteView,
  loader as accountCurrentLoader,
} from "@/routes/administracion.academias_.$academyId";
import {
  createChoreographyRecord,
  createEventCatalog,
  date as choreographyDate,
} from "@/features/portal/choreographies/test-support/db";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("administracion academias cuenta corriente", () => {
  test("lets admin open an academy account current from the academies list", async () => {
    const event = await createSavedEvent();
    const academyNorth = await createAcademyUser({
      email: "academia.norte.finanzas@example.com",
      academyName: "Academia Norte",
    });
    await createAcademyUser({
      email: "academia.sur.finanzas@example.com",
      academyName: "Academia Sur",
    });
    const { request } = await createSignedInRequest({
      email: "admin.academias.lista@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/academias?evento=${event.id}`,
    });

    const loaderData = await academiesLoader(routeArgs(request));
    const markup = renderAcademiesRoute({ loaderData });

    expect(loaderData.selectedEventId).toBe(event.id);
    expect(loaderData.academies.map((academy) => academy.name)).toEqual([
      "Academia Norte",
      "Academia Sur",
    ]);
    expect(markup).toContain("Academias");
    expect(markup).toContain(
      `/administracion/academias/${academyNorth.academy.id}`,
    );
    expect(markup).toContain("Cuenta corriente");
  });

  test("shows the blocked admin state when there is no active event", async () => {
    const academy = await createAcademyUser({
      email: "academia.sin.evento@example.com",
      academyName: "Academia Sin Evento",
    });
    const { request } = await createSignedInRequest({
      email: "admin.sin.evento.finanzas@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/academias/${academy.academy.id}`,
    });

    const loaderData = await accountCurrentLoader(
      detailRouteArgs(request, academy.academy.id),
    );
    const markup = renderAccountCurrentRoute({
      loaderData,
    });

    expect(loaderData.selectedEventId).toBeNull();
    expect(markup).toContain("Elegí un evento activo para revisar pagos");
  });

  test("allows auditor read-only access and blocks non-admin payment registration", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.auditoria.finanzas@example.com",
      academyName: "Academia Auditoria",
    });
    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditor.finanzas@example.com",
      role: "auditor",
      requestUrl: `http://localhost/administracion/academias/${academy.academy.id}?evento=${event.id}`,
    });

    const loaderData = await accountCurrentLoader(
      detailRouteArgs(auditorRequest, academy.academy.id),
    );
    const markup = renderAccountCurrentRoute({
      loaderData,
    });

    expect(loaderData.canRegisterPayments).toBe(false);
    expect(markup).toContain("Monto total pagado");
    expect(markup).not.toContain("Registrar pago");

    await expect(
      accountCurrentAction(
        detailActionArgs(
          (
            await buildPaymentRequest({
              amount: "25000",
              paymentDate: "2026-04-10",
              paymentMethod: "transferencia",
              requestUrl: `http://localhost/administracion/academias/${academy.academy.id}?evento=${event.id}`,
              role: "auditor",
            })
          ).request,
          academy.academy.id,
        ),
      ),
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  test("registers event-scoped payment numbers, persists payments, and updates totals without invoices", async () => {
    const event = await createSavedEvent();
    const otherEvent = await createInactiveEvent("Regional 2025");
    const academy = await createAcademyUser({
      email: "academia.pagos.finanzas@example.com",
      academyName: "Academia Pagos",
    });
    const { request: firstRequest } = await buildPaymentRequest({
      amount: "25000",
      paymentDate: "2026-04-10",
      paymentMethod: "transferencia",
      reference: "TRX-001",
      internalNote: "Primer pago",
      requestUrl: `http://localhost/administracion/academias/${academy.academy.id}?evento=${event.id}`,
      role: "admin",
    });

    await expect(
      accountCurrentAction(detailActionArgs(firstRequest, academy.academy.id)),
    ).rejects.toMatchObject({
      status: 302,
    });

    await db.insert(academyEventPayments).values({
      academyId: academy.academy.id,
      amount: 9999,
      createdByUserId: academy.user.id,
      eventId: otherEvent.id,
      paymentDate: "2026-03-01",
      paymentMethod: "efectivo",
      paymentNumber: 1,
    });

    const { request: secondRequest } = await buildPaymentRequest({
      amount: "8000",
      paymentDate: "2026-04-11",
      paymentMethod: "mercado_pago",
      requestUrl: `http://localhost/administracion/academias/${academy.academy.id}?evento=${event.id}`,
      role: "admin",
    });

    await expect(
      accountCurrentAction(detailActionArgs(secondRequest, academy.academy.id)),
    ).rejects.toMatchObject({
      status: 302,
    });

    const payments = await db.query.academyEventPayments.findMany({
      where: eq(academyEventPayments.academyId, academy.academy.id),
      orderBy: (table, { asc }) => [asc(table.paymentNumber)],
    });
    const loaderData = await accountCurrentLoader(
      detailRouteArgs(
        new Request(
          `http://localhost/administracion/academias/${academy.academy.id}?evento=${event.id}`,
          {
            headers: {
              cookie:
                secondRequest.headers.get("cookie") ??
                firstRequest.headers.get("cookie") ??
                "",
            },
          },
        ),
        academy.academy.id,
      ),
    );
    const markup = renderAccountCurrentRoute({
      loaderData,
    });

    expect(payments.map((payment) => payment.paymentNumber)).toEqual([1, 1, 2]);
    expect(
      payments
        .filter((payment) => payment.eventId === event.id)
        .map((payment) => payment.amount),
    ).toEqual([25000, 8000]);
    expect(loaderData.summary).toEqual({
      availableBalanceAmount: 33000,
      totalPaidAmount: 33000,
    });
    expect(loaderData.payments.map((payment) => payment.paymentNumber)).toEqual(
      [2, 1],
    );
    expect(markup).toContain("Monto total pagado");
    expect(markup).toContain("$ 33.000");
    expect(markup).toContain("Saldo disponible");
    expect(markup).toContain("Transferencia");
    expect(markup).toContain("Mercado Pago");
    expect(markup).toContain("TRX-001");
    expect(markup).toContain("Primer pago");
  });

  test("validates positive whole-peso amounts, required method, and non-future payment dates", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.validacion.finanzas@example.com",
      academyName: "Academia Validacion",
    });
    const { request } = await buildPaymentRequest({
      amount: "10.5",
      paymentDate: "2099-01-01",
      paymentMethod: "",
      requestUrl: `http://localhost/administracion/academias/${academy.academy.id}?evento=${event.id}`,
      role: "admin",
    });

    const actionData = await accountCurrentAction(
      detailActionArgs(request, academy.academy.id),
    );

    expect(actionData).toMatchObject({
      status: "error",
      message: "Revisá los datos del pago.",
      fieldErrors: {
        amount: "Ingresá un monto entero en pesos, sin centavos.",
        paymentDate: "La fecha de pago no puede ser futura.",
        paymentMethod: "Seleccioná un medio de pago.",
      },
    });
    await expect(
      db.query.academyEventPayments.findFirst({
        where: eq(academyEventPayments.academyId, academy.academy.id),
      }),
    ).resolves.toBeUndefined();
  });

  test("issues deposit invoices individually and in batch without auto-imputing available balance", async () => {
    const event = await createSavedEvent({
      requiredDepositPercentage: 35,
    });
    const academy = await createAcademyUser({
      email: "academia.facturas.finanzas@example.com",
      academyName: "Academia Facturas",
    });
    const catalog = await createEventCatalog(event.id);
    const firstChoreography = await createChoreographyRecord({
      academyId: academy.academy.id,
      categoryId: catalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-10T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Primera",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const secondChoreography = await createChoreographyRecord({
      academyId: academy.academy.id,
      categoryId: catalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-12T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Segunda",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    const { request: paymentRequest } = await buildPaymentRequest({
      amount: "12000",
      paymentDate: "2026-03-15",
      paymentMethod: "transferencia",
      requestUrl: `http://localhost/administracion/academias/${academy.academy.id}?evento=${event.id}`,
      role: "admin",
    });

    await expect(
      accountCurrentAction(
        detailActionArgs(paymentRequest, academy.academy.id),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const { request: firstInvoiceRequest } = await buildDepositInvoiceRequest({
      choreographyIds: [firstChoreography.id],
      issueDate: "2026-03-20",
      requestUrl: `http://localhost/administracion/academias/${academy.academy.id}?evento=${event.id}`,
      role: "admin",
    });

    await expect(
      accountCurrentAction(
        detailActionArgs(firstInvoiceRequest, academy.academy.id),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const { request: batchInvoiceRequest } = await buildDepositInvoiceRequest({
      choreographyIds: [secondChoreography.id],
      issueDate: "2026-03-21",
      requestUrl: `http://localhost/administracion/academias/${academy.academy.id}?evento=${event.id}`,
      role: "admin",
    });

    await expect(
      accountCurrentAction(
        detailActionArgs(batchInvoiceRequest, academy.academy.id),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const invoices = await db.query.academyEventChoreographyInvoices.findMany({
      where: eq(academyEventChoreographyInvoices.academyId, academy.academy.id),
      orderBy: (table, { asc }) => [asc(table.invoiceNumber)],
    });
    const loaderData = await accountCurrentLoader(
      detailRouteArgs(
        new Request(
          `http://localhost/administracion/academias/${academy.academy.id}?evento=${event.id}`,
          {
            headers: {
              cookie:
                batchInvoiceRequest.headers.get("cookie") ??
                firstInvoiceRequest.headers.get("cookie") ??
                paymentRequest.headers.get("cookie") ??
                "",
            },
          },
        ),
        academy.academy.id,
      ),
    );
    const markup = renderAccountCurrentRoute({
      loaderData,
    });

    expect(invoices).toMatchObject([
      {
        choreographyId: firstChoreography.id,
        invoiceNumber: 1,
        invoiceType: "sena",
        issueDate: "2026-03-20",
        basePriceAmount: 10000,
        selectedPaymentDeadline: "2026-05-31",
        requiredDepositPercentageSnapshot: 35,
        depositAmount: 3500,
      },
      {
        choreographyId: secondChoreography.id,
        invoiceNumber: 2,
        invoiceType: "sena",
        issueDate: "2026-03-21",
        basePriceAmount: 10000,
        selectedPaymentDeadline: "2026-05-31",
        requiredDepositPercentageSnapshot: 35,
        depositAmount: 3500,
      },
    ]);
    expect(loaderData.summary).toEqual({
      availableBalanceAmount: 12000,
      totalPaidAmount: 12000,
    });
    expect(markup).toContain("Facturas de seña activas");
    expect(markup).toContain("Primera");
    expect(markup).toContain("Segunda");
    expect(markup).toContain("N° 1");
    expect(markup).toContain("N° 2");
    expect(markup).toContain("$ 3.500");
  });

  test("validates deposit invoice dates, blocks duplicate active invoices, and keeps auditors read-only", async () => {
    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    const academy = await createAcademyUser({
      email: "academia.facturas.validacion@example.com",
      academyName: "Academia Facturas Validacion",
    });
    const catalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: academy.academy.id,
      categoryId: catalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-10T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Unica",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    const { request: invalidDateRequest } = await buildDepositInvoiceRequest({
      choreographyIds: [choreography.id],
      issueDate: "2026-03-09",
      requestUrl: `http://localhost/administracion/academias/${academy.academy.id}?evento=${event.id}`,
      role: "admin",
    });

    const invalidDateResult = await accountCurrentAction(
      detailActionArgs(invalidDateRequest, academy.academy.id),
    );

    expect(invalidDateResult).toMatchObject({
      status: "error",
      message: "Revisá los datos de la factura.",
      fieldErrors: {
        issueDate:
          "La fecha de emisión no puede ser anterior a la creación de la Coreografía más reciente seleccionada.",
      },
    });

    const { request: createInvoiceRequest } = await buildDepositInvoiceRequest({
      choreographyIds: [choreography.id],
      issueDate: "2026-03-20",
      requestUrl: `http://localhost/administracion/academias/${academy.academy.id}?evento=${event.id}`,
      role: "admin",
    });

    await expect(
      accountCurrentAction(
        detailActionArgs(createInvoiceRequest, academy.academy.id),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const { request: duplicateInvoiceRequest } =
      await buildDepositInvoiceRequest({
        choreographyIds: [choreography.id],
        issueDate: "2026-03-21",
        requestUrl: `http://localhost/administracion/academias/${academy.academy.id}?evento=${event.id}`,
        role: "admin",
      });

    const duplicateResult = await accountCurrentAction(
      detailActionArgs(duplicateInvoiceRequest, academy.academy.id),
    );

    expect(duplicateResult).toMatchObject({
      status: "error",
      message:
        "Ya existe una factura de seña activa para alguna de las Coreografías seleccionadas.",
    });

    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditor.facturas@example.com",
      role: "auditor",
      requestUrl: `http://localhost/administracion/academias/${academy.academy.id}?evento=${event.id}`,
    });
    const loaderData = await accountCurrentLoader(
      detailRouteArgs(auditorRequest, academy.academy.id),
    );
    const markup = renderAccountCurrentRoute({ loaderData });

    expect(markup).toContain("Facturas de seña activas");
    expect(markup).toContain("Unica");
    expect(markup).not.toContain("Emitir factura de seña");
    expect(loaderData.canRegisterPayments).toBe(false);
  });

  test("rejects invalid calendar payment dates", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.fecha-invalida.finanzas@example.com",
      academyName: "Academia Fecha Invalida",
    });
    const { request } = await buildPaymentRequest({
      amount: "25000",
      paymentDate: "2026-02-31",
      paymentMethod: "transferencia",
      requestUrl: `http://localhost/administracion/academias/${academy.academy.id}?evento=${event.id}`,
      role: "admin",
    });

    const actionData = await accountCurrentAction(
      detailActionArgs(request, academy.academy.id),
    );

    expect(actionData).toMatchObject({
      status: "error",
      message: "Revisá los datos del pago.",
      fieldErrors: {
        paymentDate: "Ingresá una fecha válida.",
      },
    });
    await expect(
      db.query.academyEventPayments.findFirst({
        where: eq(academyEventPayments.academyId, academy.academy.id),
      }),
    ).resolves.toBeUndefined();
  });
});

async function createSavedEvent(
  overrides: Partial<Parameters<typeof createEvent>[0]> = {},
) {
  const result = await createEvent({
    name: "En Escena 2026",
    registrationStartsAt: choreographyDate("2026-03-01T12:00:00Z"),
    registrationEndsAt: choreographyDate("2026-04-30T12:00:00Z"),
    startsAt: choreographyDate("2026-05-01T12:00:00Z"),
    endsAt: choreographyDate("2026-05-03T12:00:00Z"),
    ...overrides,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  await activateEvent(result.event.id);

  return result.event;
}

async function createInactiveEvent(name: string) {
  const result = await createEvent({
    name,
    registrationStartsAt: choreographyDate("2025-03-01T12:00:00Z"),
    registrationEndsAt: choreographyDate("2025-04-30T12:00:00Z"),
    startsAt: choreographyDate("2025-05-01T12:00:00Z"),
    endsAt: choreographyDate("2025-05-03T12:00:00Z"),
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.event;
}

// fallow-ignore-next-line code-duplication
async function createSignedInRequest(input: {
  email: string;
  role: "academy" | "admin" | "auditor" | "judge";
  requestUrl: string;
}) {
  const signUpResult = await createLocalAccessUser({
    email: input.email,
    name: input.email,
    password: "password-segura",
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: input.role,
    })
    .where(eq(user.id, signUpResult.response.user.id));

  return {
    userId: signUpResult.response.user.id,
    request: new Request(input.requestUrl, {
      headers: {
        cookie: createRequestCookie(signUpResult.headers),
      },
    }),
  };
}

async function createAcademyUser(input: {
  email: string;
  academyName: string;
}) {
  const signIn = await createSignedInRequest({
    email: input.email,
    role: "academy",
    requestUrl: "http://localhost/portal",
  });

  const [academy] = await db
    .insert(academies)
    .values({
      userId: signIn.userId,
      name: input.academyName,
      contactName: input.academyName,
      phone: "11-5555-5555",
    })
    .returning();

  if (!academy) {
    throw new Error("Expected academy to be created.");
  }

  return {
    academy,
    user: {
      id: signIn.userId,
    },
  };
}

async function buildPaymentRequest(input: {
  amount: string;
  internalNote?: string;
  paymentDate: string;
  paymentMethod: string;
  reference?: string;
  requestUrl: string;
  role: "admin" | "auditor";
}) {
  const signedIn = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: input.role,
    requestUrl: input.requestUrl,
  });
  const formData = new FormData();
  formData.set("intent", "register-payment");
  formData.set("amount", input.amount);
  formData.set("paymentDate", input.paymentDate);
  formData.set("paymentMethod", input.paymentMethod);
  formData.set("reference", input.reference ?? "");
  formData.set("internalNote", input.internalNote ?? "");

  return {
    request: new Request(input.requestUrl, {
      method: "POST",
      body: formData,
      headers: {
        cookie: signedIn.request.headers.get("cookie") ?? "",
      },
    }),
  };
}

async function buildDepositInvoiceRequest(input: {
  choreographyIds: string[];
  issueDate: string;
  requestUrl: string;
  role: "admin" | "auditor";
}) {
  const signedIn = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: input.role,
    requestUrl: input.requestUrl,
  });
  const formData = new FormData();
  formData.set("intent", "issue-deposit-invoices");
  formData.set("issueDate", input.issueDate);

  for (const choreographyId of input.choreographyIds) {
    formData.append("choreographyIds", choreographyId);
  }

  return {
    request: new Request(input.requestUrl, {
      method: "POST",
      body: formData,
      headers: {
        cookie: signedIn.request.headers.get("cookie") ?? "",
      },
    }),
  };
}

function renderAcademiesRoute(input: {
  loaderData: Awaited<ReturnType<typeof academiesLoader>>;
}) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: ["/administracion/academias"],
      },
      createElement(AdministracionAcademiasRouteView, {
        loaderData: input.loaderData,
      }),
    ),
  );
}

function renderAccountCurrentRoute(input: {
  loaderData: Awaited<ReturnType<typeof accountCurrentLoader>>;
}) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: [
          `/administracion/academias/${input.loaderData.academy.id}`,
        ],
      },
      createElement(AdministracionAcademiaCuentaCorrienteRouteView, {
        loaderData: input.loaderData,
      }),
    ),
  );
}

function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/academias",
  };
}

function detailRouteArgs(request: Request, academyId: string) {
  return {
    request,
    params: { academyId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/academias/:academyId",
  };
}

function detailActionArgs(request: Request, academyId: string) {
  return {
    request,
    params: { academyId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/academias/:academyId",
  };
}

// fallow-ignore-next-line code-duplication
function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  return setCookie.split(";")[0] ?? "";
}
