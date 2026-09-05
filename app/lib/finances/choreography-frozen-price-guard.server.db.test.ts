import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { prices, scheduleCapacities } from "@/db/schema";
import {
  createAcademySession,
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
  createSelectedPriceInscriptionForTest,
} from "@/features/portal/choreographies/test-support/db";
import { createScheduleForModalityFixture } from "@/lib/choreographies/registration-test-fixtures.server.db";
import { hasPriceDivergentInscription } from "@/lib/finances/choreography-frozen-price-guard.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

/**
 * A `solo` choreography on the catalogue's schedule and a second schedule to
 * move it to, with the prices spelled out by each test: the deadline-less rows
 * are what makes the resolution independent of the day the suite runs on.
 */
async function createGuardScenario(slug: string) {
  const owner = await createAcademySession({
    academyName: `Academia ${slug}`,
    email: `guard.precio.${slug}@example.com`,
  });
  const event = await createEventRecord({
    active: true,
    name: "Regional 2026",
  });
  const catalog = await createEventCatalog(event.id);
  const destinationSchedule = await createScheduleForModalityFixture({
    eventId: event.id,
    modalityId: catalog.modality.id,
  });
  const [destinationCapacity] = await db
    .insert(scheduleCapacities)
    .values({
      capacity: 5,
      groupType: "solo",
      scheduleId: destinationSchedule.id,
    })
    .returning();
  const choreography = await createChoreographyRecord({
    academyId: owner.academyId,
    categoryId: catalog.categoryWithLevel.id,
    eventId: event.id,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    name: "Guardia",
    scheduleCapacityId: catalog.scheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });

  // The catalogue's own price carries a deadline that may have passed; every
  // test states the rows it wants from scratch.
  await db.delete(prices).where(eq(prices.eventId, event.id));

  return {
    academyId: owner.academyId,
    catalog,
    choreography,
    destinationCapacity,
    destinationSchedule,
    event,
    async addMoney(input: {
      allocatedAmount: number;
      selectedPriceId?: string | null;
    }) {
      return await createSelectedPriceInscriptionForTest({
        academyId: owner.academyId,
        allocatedAmount: input.allocatedAmount,
        choreographyId: choreography.id,
        eventId: event.id,
        selectedPriceId: input.selectedPriceId ?? null,
      });
    },
    async addPrice(input: {
      amount: number;
      groupType?: "solo" | "duo";
      scheduleId?: string;
    }) {
      const [price] = await db
        .insert(prices)
        .values({
          amount: input.amount,
          eventId: event.id,
          groupType: input.groupType ?? "solo",
          name: `Precio ${input.amount} ${input.scheduleId ?? "general"}`,
          paymentDeadline: null,
          scheduleId: input.scheduleId ?? null,
        })
        .returning();

      return price;
    },
    async diverges(
      destination: {
        groupType?: "solo" | "duo";
        scheduleId?: string | null;
      } = {},
    ) {
      return await hasPriceDivergentInscription({
        choreographyId: choreography.id,
        destination: {
          groupType: destination.groupType ?? "solo",
          scheduleId:
            destination.scheduleId === undefined
              ? destinationSchedule.id
              : destination.scheduleId,
        },
        executor: db,
      });
    },
  };
}

describe("price divergence guard on a schedule capacity move", () => {
  test("passes a choreography with no money on it", async () => {
    const scenario = await createGuardScenario("sin-dinero");
    await scenario.addPrice({ amount: 10000 });
    await scenario.addPrice({
      amount: 20000,
      scheduleId: scenario.destinationSchedule.id,
    });
    await scenario.addMoney({ allocatedAmount: 0 });

    await expect(scenario.diverges()).resolves.toBe(false);
  });

  test("passes a frozen inscription holding a general price row", async () => {
    const scenario = await createGuardScenario("congelada-general");
    const general = await scenario.addPrice({ amount: 10000 });
    await scenario.addPrice({
      amount: 20000,
      scheduleId: scenario.destinationSchedule.id,
    });
    // 3000 is the 30 % deposit of 10000: at the threshold the stored row wins
    // whatever schedule the choreography sits on.
    await scenario.addMoney({
      allocatedAmount: 3000,
      selectedPriceId: general.id,
    });

    await expect(scenario.diverges()).resolves.toBe(false);
  });

  test("refuses a below-threshold inscription whose destination amount differs", async () => {
    const scenario = await createGuardScenario("bajo-umbral-distinto");
    const general = await scenario.addPrice({ amount: 10000 });
    await scenario.addPrice({
      amount: 20000,
      scheduleId: scenario.destinationSchedule.id,
    });
    await scenario.addMoney({
      allocatedAmount: 1000,
      selectedPriceId: general.id,
    });

    await expect(scenario.diverges()).resolves.toBe(true);
  });

  test("passes a below-threshold inscription whose destination amount is equal", async () => {
    const scenario = await createGuardScenario("bajo-umbral-igual");
    const general = await scenario.addPrice({ amount: 10000 });
    // The move between two schedules that both fall back to the general row is
    // price-neutral by construction, which is what most of the fleet looks like.
    await scenario.addMoney({
      allocatedAmount: 1000,
      selectedPriceId: general.id,
    });

    await expect(scenario.diverges()).resolves.toBe(false);
  });

  test("passes when no price resolves on either side, and refuses each transition into one", async () => {
    const scenario = await createGuardScenario("sin-precio");
    await scenario.addMoney({ allocatedAmount: 1000 });

    await expect(scenario.diverges()).resolves.toBe(false);

    const destinationPrice = await scenario.addPrice({
      amount: 20000,
      scheduleId: scenario.destinationSchedule.id,
    });

    // `null → number`.
    await expect(scenario.diverges()).resolves.toBe(true);

    // And the mirror image, `number → null`: the choreography sits on the only
    // schedule that has a row.
    await db
      .update(prices)
      .set({ scheduleId: scenario.catalog.schedule.id })
      .where(eq(prices.id, destinationPrice.id));

    await expect(scenario.diverges()).resolves.toBe(true);
  });

  test("refuses to carry a frozen row pinned to the schedule it leaves", async () => {
    const scenario = await createGuardScenario("congelada-fijada");
    const pinned = await scenario.addPrice({
      amount: 10000,
      scheduleId: scenario.catalog.schedule.id,
    });
    // The same amount on both sides: the pinning alone is what refuses, because
    // the destination's allocation dialog could no longer offer this row.
    await scenario.addPrice({
      amount: 10000,
      scheduleId: scenario.destinationSchedule.id,
    });
    await scenario.addMoney({
      allocatedAmount: 3000,
      selectedPriceId: pinned.id,
    });

    await expect(scenario.diverges()).resolves.toBe(true);
    // Staying on the schedule the row is pinned to is inert.
    await expect(
      scenario.diverges({ scheduleId: scenario.catalog.schedule.id }),
    ).resolves.toBe(false);
  });

  test("refuses a group-type move that reprices a below-threshold inscription", async () => {
    const scenario = await createGuardScenario("tipo-de-grupo");
    const solo = await scenario.addPrice({ amount: 10000 });
    await scenario.addPrice({ amount: 15000, groupType: "duo" });
    await scenario.addMoney({
      allocatedAmount: 1000,
      selectedPriceId: solo.id,
    });

    // The roster path's shape: the schedule stays put and the group type moves,
    // which is the primary component of the price key.
    await expect(
      scenario.diverges({
        groupType: "duo",
        scheduleId: scenario.catalog.schedule.id,
      }),
    ).resolves.toBe(true);
  });

  test("passes a group-type move under a frozen inscription", async () => {
    const scenario = await createGuardScenario("tipo-de-grupo-congelado");
    const solo = await scenario.addPrice({ amount: 10000 });
    await scenario.addPrice({ amount: 15000, groupType: "duo" });
    await scenario.addMoney({
      allocatedAmount: 3000,
      selectedPriceId: solo.id,
    });

    // What freezing already means: the solo turning into a duo keeps its own
    // price, while the dancer joining it gets today's live duo price.
    await expect(
      scenario.diverges({
        groupType: "duo",
        scheduleId: scenario.catalog.schedule.id,
      }),
    ).resolves.toBe(false);
  });
});
