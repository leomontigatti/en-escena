import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographyDancers } from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import { createAcademyFinanceChoreographyFixture } from "@/lib/admin/finances/finances.test-support";
import { allocatePayment } from "@/lib/comprobantes/comprobante-emission.test-support";
import { insertTestPrices } from "@/lib/prices/price-rows.test-support";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createSavedEvent } from "@/lib/test-support/events";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { sumPresetOwedAmount } from "./preset-figures";
import { loadAcademyFinances } from "./server";

installDatabaseTestHooks();

/*
 * What the loader hands the preset dialog to test a pick the way the writer
 * does: the deposit of the row each inscription stores, not the effective one.
 */

describe("academy finance list — preset dialog data", () => {
  test("hands the dialog the stored deposit, below which a pick still reaches a row the list moved down under", async () => {
    const seed = await seedListThatMovedDown();
    const stored = await seed.enrol({ allocated: 2500, stored: true });
    const data = await seed.load();

    expect(data.requiredDepositPercentage).toBe(30);
    expect(data.inscriptions.find(({ id }) => id === stored)).toMatchObject({
      allocatedAmount: 2500,
      basePriceId: seed.priceTodayId,
      storedDepositAmount: 3000,
    });
    expect(
      sumPresetOwedAmount({
        groupTypeByChoreography: { [seed.choreographyId]: "solo" },
        inscriptions: data.inscriptions.filter(({ id }) => id === stored),
        pickedPriceByGroupType: {
          solo: data.priceOptionsByGroupType.solo.find(
            ({ id }) => id === seed.priceStoredId,
          )!,
        },
        requiredDepositPercentage: data.requiredDepositPercentage,
        stage: "deposit",
      }),
    ).toEqual({ amount: 500, status: "complete" });
  });

  test("hands no stored deposit for an inscription that stores no row", async () => {
    const seed = await seedListThatMovedDown();
    const unstored = await seed.enrol({ allocated: 0, stored: false });
    const { inscriptions } = await seed.load();

    expect(
      inscriptions.find(({ id }) => id === unstored)?.storedDepositAmount,
    ).toBeNull();
  });
});

/** A solo row of 10000 gone by, and today's of 8000: deposits 3000 and 2400. */
async function seedListThatMovedDown() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Lista",
      choreographyName: "Primera",
      email: "academia.lista@example.com",
      event,
    });
  const [priceStored, priceToday] = await insertTestPrices([
    {
      amount: 10000,
      eventId: event.id,
      groupType: "solo",
      name: "Solo vencido",
      paymentDeadline: "2000-01-01",
    },
    {
      amount: 8000,
      eventId: event.id,
      groupType: "solo",
      name: "Solo vigente",
      paymentDeadline: "2099-12-31",
    },
  ]);
  const academyId = academy.academy.id;

  return {
    choreographyId: choreography.id,
    priceStoredId: priceStored.id,
    priceTodayId: priceToday.id,
    async enrol(input: { allocated: number; stored: boolean }) {
      const dancer = await createDancer(academyId);
      const [inscription] = await db
        .insert(choreographyDancers)
        .values({
          ageAtEventStart: 14,
          choreographyId: choreography.id,
          dancerId: dancer.id,
          selectedPriceId: input.stored ? priceStored.id : null,
        })
        .returning();

      if (input.allocated > 0) {
        await allocatePayment({
          academyId,
          amount: input.allocated,
          eventId: event.id,
          inscriptionId: inscription.id,
        });
      }

      return inscription.id;
    },
    async load() {
      const { request } = await createSignedInRequest({
        email: "admin.presets@example.com",
        requestUrl: `http://localhost/administracion/finanzas/${academyId}?evento=${event.id}`,
        role: "admin",
      });

      return await loadAcademyFinances({
        params: { academyId },
        request,
      });
    },
  };
}
