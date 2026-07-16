import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  payments as paymentTable,
  choreographyDancers,
  prices,
} from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
} from "@/features/portal/choreographies/test-support/db";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import { loader as academiesLoader } from "@/routes/administracion.academias";
import {
  action as accountCurrentAction,
  loader as accountCurrentLoader,
} from "@/routes/administracion.academias_.$academyId";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  accountCurrentUrl,
  buildPaymentRequest,
  createAcademyUser,
  createAccountCurrentChoreographyFixture,
  createInactiveEvent,
  createSavedEvent,
  createSignedInRequest,
  detailActionArgs,
  detailRouteArgs,
  renderAcademiesRoute,
  renderAccountCurrentRoute,
  routeArgs,
} from "./account-current-route.test-support";

installDatabaseTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

describe.sequential("administracion academias cuenta corriente", () => {
  test("renders academies participation without account-current links", async () => {
    const event = await createSavedEvent();
    const academyNorth = await createAcademyUser({
      email: "academia.norte.finanzas@example.com",
      academyName: "Academia Norte",
    });
    await createAcademyUser({
      email: "academia.sur.finanzas@example.com",
      academyName: "Academia Sur",
    });
    const eventCatalog = await createEventCatalog(event.id);
    await createChoreographyRecord({
      academyId: academyNorth.academy.id,
      categoryId: eventCatalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: eventCatalog.level.id,
      modalityId: eventCatalog.modality.id,
      name: "Norte Activa",
      scheduleCapacityId: eventCatalog.scheduleCapacity.id,
      submodalityId: eventCatalog.submodality.id,
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
    expect(markup).not.toContain(
      `/administracion/academias/${academyNorth.academy.id}`,
    );
    expect(markup).toContain("Participando");
    expect(markup).toContain("No participando");
    expect(markup).toContain('aria-label="Filtros"');
    expect(markup).toMatch(/<button[^>]*>Nombre/);
    expect(markup).not.toMatch(/<button[^>]*>Contacto/);
    expect(markup).not.toMatch(/<button[^>]*>Estado/);
    expect(markup).not.toContain("Finanzas");
    expect(markup).not.toContain("Cuenta corriente</td>");
  });

  test("shows academies list without an active event", async () => {
    await createAcademyUser({
      email: "academia.visible.sin.evento@example.com",
      academyName: "Academia Visible",
    });
    const { request } = await createSignedInRequest({
      email: "admin.academias.sin.evento@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/academias",
    });

    const loaderData = await academiesLoader(routeArgs(request));
    const markup = renderAcademiesRoute({ loaderData });

    expect(loaderData.selectedEventId).toBeNull();
    expect(loaderData.academies).toMatchObject([
      {
        name: "Academia Visible",
        isParticipating: false,
      },
    ]);
    expect(markup).toContain("Academia Visible");
    expect(markup).toContain("No participando");
    expect(markup).not.toContain(
      "Elegí un evento activo para revisar academias",
    );
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
    expect(markup).toContain(
      "Elegí un evento activo para revisar la cuenta corriente",
    );
  });

  test("uses the frozen seña snapshot for a señada choreography's operational amounts", async () => {
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-06-01",
    );

    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    const { academy, choreography } =
      await createAccountCurrentChoreographyFixture({
        academyName: "Academia Snapshot",
        choreographyName: "Coreografía Snapshot",
        email: "academia.snapshot.cuenta.corriente@example.com",
        event,
      });
    const dancer = await createDancer(academy.academy.id, {
      firstName: "Ana",
      lastName: "López",
    });

    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
      frozenBasePriceAmount: 12000,
      depositReferenceDate: "2026-03-20",
      depositPercentage: 30,
      depositAmount: 3600,
    });

    const { request } = await createSignedInRequest({
      email: "admin.snapshot.cuenta.corriente@example.com",
      role: "admin",
      requestUrl: accountCurrentUrl(academy.academy.id, event.id),
    });

    const loaderData = await accountCurrentLoader(
      detailRouteArgs(request, academy.academy.id),
    );
    const markup = renderAccountCurrentRoute({ loaderData });

    expect(loaderData.choreographyFinanceRows).toMatchObject([
      {
        id: choreography.id,
        basePriceAmount: { amount: 12000, status: "complete" },
        depositAmount: { amount: 3600, status: "complete" },
        financialState: "señada",
        owedAmount: { amount: 8400, status: "complete" },
        owedDepositAmount: { amount: 0, status: "complete" },
      },
    ]);
    expect(loaderData.summary).toEqual({
      availableBalanceAmount: 0,
      owedAmount: { amount: 8400, status: "complete" },
      owedDepositAmount: { amount: 0, status: "complete" },
      totalPaidAmount: 0,
    });
    expect(markup).toContain("$ 3.600");
    expect(markup).toContain("$ 8.400");
    expect(markup).toContain("Señada");
    expect(markup).not.toContain("Impaga");
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
      requestUrl: accountCurrentUrl(academy.academy.id, event.id),
    });

    const loaderData = await accountCurrentLoader(
      detailRouteArgs(auditorRequest, academy.academy.id),
    );
    const markup = renderAccountCurrentRoute({
      loaderData,
    });

    expect(loaderData.canRegisterPayments).toBe(false);
    expect(markup).toContain("Cuenta corriente");
    expect(markup).toContain("Seña adeudada");
    expect(markup).not.toContain("Monto total pagado");
    expect(markup).not.toContain("Registrar pago");

    await expect(
      accountCurrentAction(
        detailActionArgs(
          (
            await buildPaymentRequest({
              amount: "25000",
              paymentDate: "2026-04-10",
              paymentMethod: "transferencia",
              requestUrl: accountCurrentUrl(academy.academy.id, event.id),
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

  test("shows searchable choreography finance rows after the summary cards", async () => {
    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    const academy = await createAcademyUser({
      email: "academia.coreografias.finanzas@example.com",
      academyName: "Academia Coreografias",
    });
    const catalog = await createEventCatalog(event.id);
    await db.insert(prices).values({
      amount: 10000,
      eventId: event.id,
      groupType: "solo",
      name: "Precio Solo vigente",
      paymentDeadline: "2026-12-31",
      scheduleId: catalog.schedule.id,
    });
    const aire = await createChoreographyRecord({
      academyId: academy.academy.id,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Aire",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const tango = await createChoreographyRecord({
      academyId: academy.academy.id,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Tango",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    for (const choreographyId of [aire.id, tango.id]) {
      const dancer = await createDancer(academy.academy.id, {
        firstName: `Bailarín ${choreographyId}`,
        lastName: "Solo",
      });
      await db.insert(choreographyDancers).values({
        ageAtEventStart: 14,
        choreographyId,
        dancerId: dancer.id,
      });
    }
    const { request } = await createSignedInRequest({
      email: "admin.coreografias.finanzas@example.com",
      role: "admin",
      requestUrl: accountCurrentUrl(academy.academy.id, event.id),
    });

    const loaderData = await accountCurrentLoader(
      detailRouteArgs(request, academy.academy.id),
    );
    const markup = renderAccountCurrentRoute({
      loaderData,
    });

    // Each impaga inscription owes only its pending seña (30% of $10.000).
    expect(loaderData.choreographyFinanceRows).toMatchObject([
      {
        name: "Aire",
        owedAmount: { status: "complete", amount: 3000 },
        owedDepositAmount: { status: "complete", amount: 3000 },
      },
      {
        name: "Tango",
        owedAmount: { status: "complete", amount: 3000 },
        owedDepositAmount: { status: "complete", amount: 3000 },
      },
    ]);
    expect(markup).toContain("Cuenta corriente");
    expect(markup).toContain("Buscar coreografía por nombre");
    expect(markup).toContain('aria-label="Seleccionar todas las filas"');
    expect(markup).toContain("Nombre");
    expect(markup).toContain("Tipo de grupo");
    expect(markup).toMatch(
      /data-slot="badge"[^>]*data-variant="secondary"[^>]*>Solo/,
    );
    expect(markup).toContain("Seña");
    expect(markup).not.toContain("Pagado");
    expect(markup).toContain("Saldo");
    expect(markup).toContain("Estado");
    expect(markup).toContain("Aire");
    expect(markup).toContain("Tango");
    expect(markup).toContain("$ 3.000");
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
      requestUrl: accountCurrentUrl(academy.academy.id, event.id),
      role: "admin",
    });

    await expect(
      accountCurrentAction(detailActionArgs(firstRequest, academy.academy.id)),
    ).rejects.toMatchObject({
      status: 302,
    });

    await db.insert(paymentTable).values({
      academyId: academy.academy.id,
      amount: 9999,
      eventId: otherEvent.id,
      paymentDate: "2026-03-01",
      paymentMethod: "efectivo",
      paymentNumber: 1,
    });

    const { request: secondRequest } = await buildPaymentRequest({
      amount: "8000",
      paymentDate: "2026-04-11",
      paymentMethod: "mercado_pago",
      requestUrl: accountCurrentUrl(academy.academy.id, event.id),
      role: "admin",
    });

    await expect(
      accountCurrentAction(detailActionArgs(secondRequest, academy.academy.id)),
    ).rejects.toMatchObject({
      status: 302,
    });

    const payments = await db.query.payments.findMany({
      where: eq(paymentTable.academyId, academy.academy.id),
      orderBy: (table, { asc }) => [asc(table.paymentNumber)],
    });
    const loaderData = await accountCurrentLoader(
      detailRouteArgs(
        new Request(accountCurrentUrl(academy.academy.id, event.id), {
          headers: {
            cookie:
              secondRequest.headers.get("cookie") ??
              firstRequest.headers.get("cookie") ??
              "",
          },
        }),
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
      owedAmount: { status: "complete", amount: 0 },
      owedDepositAmount: { status: "complete", amount: 0 },
      totalPaidAmount: 33000,
    });
    expect(loaderData.payments.map((payment) => payment.paymentNumber)).toEqual(
      [2, 1],
    );
    expect(markup).not.toContain("Monto total pagado");
    expect(markup).toContain("$ 33.000");
    expect(markup).toContain("Seña adeudada");
    expect(markup).toContain("Saldo adeudado");
    expect(markup).toContain("Saldo disponible");
    expect(markup).not.toContain("Pagos activos");
    expect(markup).not.toContain("Transferencia");
    expect(markup).not.toContain("Mercado Pago");
    expect(markup).not.toContain("TRX-001");
    expect(markup).not.toContain("Primer pago");
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
      requestUrl: accountCurrentUrl(academy.academy.id, event.id),
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
      db.query.payments.findFirst({
        where: eq(paymentTable.academyId, academy.academy.id),
      }),
    ).resolves.toBeUndefined();
  });
});
