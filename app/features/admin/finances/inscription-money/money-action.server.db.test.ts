import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  payments,
  prices,
  seminarInscriptions,
  seminarPrices,
} from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import { createAcademyFinanceChoreographyFixture } from "@/lib/admin/finances/finances.test-support";
import { seedEventSeminarFinanceFixture } from "@/lib/admin/finances/seminar-finances.test-support";
import { readInscriptionAllocatedAmount } from "@/lib/finances/allocation-pool.server";
import type {
  AllocationTarget,
  AllocationTargetKind,
} from "@/lib/finances/allocation-target.server";
import { createSavedEvent } from "@/lib/test-support/events";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import {
  allocateInscriptionIntent,
  releaseInscriptionExcessIntent,
  releaseRetainedDepositIntent,
  removeInscriptionMoneyIntent,
  targetKindFieldName,
} from "./intents";
import { runInscriptionMoneyIntent } from "./money-action.server";

installDatabaseTestHooks();

type SeededInscription = {
  academyId: string;
  eventId: string;
  otherKind: AllocationTargetKind;
  /** The choreography or the seminar the inscription hangs from. */
  parentId: string;
  priceId: string;
  /** Drops the row's price under the money on it: a passive excess. */
  reprice: (amount: number) => Promise<void>;
  target: AllocationTarget;
  /** Stamps the row withdrawn, keeping whatever it holds. */
  withdraw: () => Promise<void>;
};

async function seedChoreographyInscription(): Promise<SeededInscription> {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Runner",
      choreographyName: "Runner",
      email: `runner.${crypto.randomUUID()}@example.com`,
      event,
    });
  const academyId = academy.academy.id;
  const dancer = await createDancer(academyId, {
    firstName: "Ana",
    lastName: "Alonso",
  });
  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    })
    .returning();
  const [price] = await db
    .select({ id: prices.id })
    .from(prices)
    .where(eq(prices.eventId, event.id));

  await db.insert(payments).values({
    academyId,
    amount: 50000,
    eventId: event.id,
    paymentDate: "2026-04-01",
    paymentMethod: "transferencia",
    paymentNumber: 1,
  });

  return {
    academyId,
    eventId: event.id,
    otherKind: "seminar",
    parentId: choreography.id,
    priceId: price!.id,
    reprice: async (amount) => {
      await db.update(prices).set({ amount }).where(eq(prices.id, price!.id));
    },
    target: { id: inscription!.id, kind: "choreography" },
    withdraw: async () => {
      await db
        .update(choreographyDancers)
        .set({ withdrawnAt: new Date() })
        .where(eq(choreographyDancers.id, inscription!.id));
    },
  };
}

async function seedSeminarInscription(): Promise<SeededInscription> {
  const fixture = await seedEventSeminarFinanceFixture();

  return {
    academyId: fixture.northAcademyId,
    eventId: fixture.eventId,
    otherKind: "choreography",
    parentId: fixture.abrilSeminarId,
    priceId: fixture.priceId,
    reprice: async (amount) => {
      await db
        .update(seminarPrices)
        .set({ amount })
        .where(eq(seminarPrices.id, fixture.priceId));
    },
    target: { id: fixture.anaInscriptionId, kind: "seminar" },
    withdraw: async () => {
      await db
        .update(seminarInscriptions)
        .set({ withdrawnAt: new Date() })
        .where(eq(seminarInscriptions.id, fixture.anaInscriptionId));
    },
  };
}

function form(fields: Record<string, string>) {
  const formData = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    formData.set(name, value);
  }

  return formData;
}

function expectedScopeOf(seeded: SeededInscription) {
  return { academyId: seeded.academyId, parentId: seeded.parentId };
}

/** What every form of a row posts, on the screen about that row's unit. */
function run(
  seeded: SeededInscription,
  fields: Record<string, string>,
  overrides: Partial<Parameters<typeof runInscriptionMoneyIntent>[0]> = {},
) {
  return runInscriptionMoneyIntent({
    eventId: seeded.eventId,
    expectedScope: expectedScopeOf(seeded),
    formData: form({
      inscriptionId: seeded.target.id,
      [targetKindFieldName]: seeded.target.kind,
      ...fields,
    }),
    kind: seeded.target.kind,
    ...overrides,
  });
}

function readAllocated(seeded: SeededInscription) {
  return readInscriptionAllocatedAmount(db, seeded.target);
}

async function fund(seeded: SeededInscription, amount: number) {
  expect(
    await run(seeded, {
      amount: String(amount),
      intent: allocateInscriptionIntent,
      priceId: seeded.priceId,
    }),
  ).toMatchObject({ status: "success" });
}

const kinds = [
  { kind: "choreography", seed: seedChoreographyInscription },
  { kind: "seminar", seed: seedSeminarInscription },
] as const;

const processMessage = "No pudimos procesar esa acción.";
const notFoundMessage = "No encontramos esa inscripción.";

describe.each(kinds)("the money runner on a $kind inscription", ({ seed }) => {
  test("allocates the typed amount at the picked price", async () => {
    const seeded = await seed();

    const answer = await run(seeded, {
      amount: "2000",
      intent: allocateInscriptionIntent,
      priceId: seeded.priceId,
    });

    expect(answer).toEqual({ message: "Dinero asignado.", status: "success" });
    expect(await readAllocated(seeded)).toBe(2000);
  });

  test("takes the typed amount off", async () => {
    const seeded = await seed();
    await fund(seeded, 2000);

    const answer = await run(seeded, {
      amount: "500",
      intent: removeInscriptionMoneyIntent,
    });

    expect(answer).toEqual({ message: "Dinero quitado.", status: "success" });
    expect(await readAllocated(seeded)).toBe(1500);
  });

  test("releases the excess with nothing typed", async () => {
    const seeded = await seed();
    await fund(seeded, 8000);
    await seeded.reprice(6000);

    const answer = await run(seeded, {
      intent: releaseInscriptionExcessIntent,
    });

    expect(answer).toEqual({
      message: "Excedente liberado.",
      status: "success",
    });
    expect(await readAllocated(seeded)).toBe(6000);
  });

  test("releases a withdrawn row's retained deposit with nothing typed", async () => {
    const seeded = await seed();
    await fund(seeded, 2000);
    await seeded.withdraw();

    const answer = await run(seeded, { intent: releaseRetainedDepositIntent });

    expect(answer).toEqual({ message: "Seña liberada.", status: "success" });
    expect(await readAllocated(seeded)).toBe(0);
  });

  test("passes a gesture's refusal through as an error", async () => {
    const seeded = await seed();

    const answer = await run(seeded, {
      intent: releaseInscriptionExcessIntent,
    });

    expect(answer).toEqual({
      message: "Esta inscripción no tiene excedente para liberar.",
      status: "error",
    });
  });

  test.each([
    { amount: "0", intent: allocateInscriptionIntent },
    { amount: "abc", intent: removeInscriptionMoneyIntent },
  ])("refuses the amount $amount on $intent", async (fields) => {
    const seeded = await seed();

    expect(await run(seeded, fields)).toEqual({
      message: "Ingresá un monto mayor a 0.",
      status: "error",
    });
  });

  test("refuses an unknown intent", async () => {
    const seeded = await seed();

    expect(await run(seeded, { intent: "no-such-intent" })).toEqual({
      message: processMessage,
      status: "error",
    });
  });

  test("refuses a target of the other kind before looking the row up", async () => {
    const seeded = await seed();

    const answer = await run(seeded, {
      amount: "1000",
      intent: allocateInscriptionIntent,
      priceId: seeded.priceId,
      [targetKindFieldName]: seeded.otherKind,
    });

    expect(answer).toEqual({ message: processMessage, status: "error" });
    expect(await readAllocated(seeded)).toBe(0);
  });

  test("refuses a form that names no kind", async () => {
    const seeded = await seed();

    const answer = await run(seeded, {
      amount: "1000",
      intent: allocateInscriptionIntent,
      [targetKindFieldName]: "",
    });

    expect(answer).toEqual({ message: processMessage, status: "error" });
  });

  test.each(["no-such-inscription", ""])(
    "refuses a missing inscription (%j)",
    async (inscriptionId) => {
      const seeded = await seed();

      const answer = await run(seeded, {
        amount: "1000",
        inscriptionId,
        intent: allocateInscriptionIntent,
      });

      expect(answer).toEqual({ message: notFoundMessage, status: "error" });
    },
  );

  test("refuses an inscription of another event", async () => {
    const seeded = await seed();
    const answer = await run(
      seeded,
      {
        amount: "1000",
        intent: allocateInscriptionIntent,
        priceId: seeded.priceId,
      },
      { eventId: "another-event" },
    );

    expect(answer).toEqual({ message: notFoundMessage, status: "error" });
    expect(await readAllocated(seeded)).toBe(0);
  });

  test.each([
    { name: "parent", outside: { parentId: "another-parent" } },
    { name: "academy", outside: { academyId: "another-academy" } },
  ])(
    "refuses an inscription outside the expected $name",
    async ({ outside }) => {
      const seeded = await seed();

      const answer = await run(
        seeded,
        {
          amount: "1000",
          intent: allocateInscriptionIntent,
          priceId: seeded.priceId,
        },
        { expectedScope: { ...expectedScopeOf(seeded), ...outside } },
      );

      expect(answer).toEqual({ message: notFoundMessage, status: "error" });
      expect(await readAllocated(seeded)).toBe(0);
    },
  );

  test("reads academy and parent off the row when no scope is expected", async () => {
    const seeded = await seed();

    const answer = await run(
      seeded,
      {
        amount: "1000",
        intent: allocateInscriptionIntent,
        priceId: seeded.priceId,
      },
      { expectedScope: undefined },
    );

    expect(answer).toEqual({ message: "Dinero asignado.", status: "success" });
    expect(await readAllocated(seeded)).toBe(1000);
  });
});
