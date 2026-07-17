import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographies, choreographyDancers, prices } from "@/db/schema";
import {
  createEventCatalog,
  createDancer,
} from "@/features/portal/choreographies/test-support/db";
import { quoteChoreographyDepositTotals } from "@/lib/finances/choreography-cobro.server";
import {
  createAccountCurrentChoreographyFixture,
  createSavedEvent,
} from "@/lib/admin/academies/account-current-route.test-support";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential(
  "quoteChoreographyDepositTotals schedule resolution",
  () => {
    // Regresión: una coreografía puede usar la capacidad total de su cronograma
    // (`scheduleId` seteado, `scheduleCapacityId` NULL). El precio depende del
    // cronograma, no del cupo: la cotización debe usar el precio específico del
    // cronograma, igual que el detalle financiero. Antes del fix la cotización
    // derivaba el cronograma sólo del cupo, caía al precio general y ofrecía una
    // seña más cara que la mostrada, escondiendo pagos que sí la cubren.
    test("uses the schedule-specific price when the choreography has a schedule but no capacity", async () => {
      const event = await createSavedEvent({ requiredDepositPercentage: 30 });
      const catalog = await createEventCatalog(event.id);
      const { academy, choreography } =
        await createAccountCurrentChoreographyFixture({
          academyName: "Academia Cronograma",
          email: `cronograma.${crypto.randomUUID()}@example.com`,
          choreographyName: "Cronograma coreografía",
          event,
          catalog,
        });

      // El precio específico del cronograma es más barato que el general; la
      // coreografía apunta al cronograma pero sin cupo específico.
      await db.insert(prices).values({
        eventId: event.id,
        name: "Precio Solo cronograma",
        groupType: "solo",
        amount: 35000,
        paymentDeadline: "2026-06-30",
        scheduleId: catalog.schedule.id,
      });
      await db
        .update(choreographies)
        .set({ scheduleId: catalog.schedule.id, scheduleCapacityId: null })
        .where(eq(choreographies.id, choreography.id));

      const dancer = await createDancer(academy.academy.id);
      await db.insert(choreographyDancers).values({
        ageAtEventStart: 14,
        choreographyId: choreography.id,
        dancerId: dancer.id,
      });

      const totals = await quoteChoreographyDepositTotals({
        choreographyId: choreography.id,
        eventId: event.id,
        referenceDates: ["2026-04-10"],
      });

      // 30% de 35000 (específico), no 30% de 10000 (general del catálogo).
      expect(totals.get("2026-04-10")).toBe(10500);
    });
  },
);
