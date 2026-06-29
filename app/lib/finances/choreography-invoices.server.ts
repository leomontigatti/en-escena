import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  choreographies,
  eventFinancialSequences,
  events,
  scheduleCapacities,
} from "@/db/schema";
import { resolveApplicablePrice } from "@/lib/events/bases-repository.server";
import { isDateOnly, isFutureDateOnly } from "@/lib/shared/date-only";

type DepositInvoiceValidationResult =
  | {
      ok: true;
      choreographies: Array<{
        id: string;
        name: string;
        basePriceAmount: number;
        createdOn: string;
        selectedPaymentDeadline: string | null;
      }>;
      event: {
        id: string;
        requiredDepositPercentage: number;
      };
    }
  | {
      ok: false;
      fieldErrors: {
        choreographyIds?: string;
        issueDate?: string;
      };
      message: string;
    };

export async function issueDepositInvoices(input: {
  academyId: string;
  choreographyIds: string[];
  createdByUserId: string;
  eventId: string;
  issueDate: string;
}) {
  const validated = await validateDepositInvoiceInput(input);

  if (!validated.ok) {
    return validated;
  }

  const { choreographies: eligibleChoreographies, event } = validated;
  const requiredDepositPercentage = event.requiredDepositPercentage;

  await db.transaction(async (tx) => {
    await tx
      .insert(eventFinancialSequences)
      .values({
        eventId: input.eventId,
      })
      .onConflictDoNothing();

    const [sequence] = await tx
      .select({
        nextInvoiceNumber: eventFinancialSequences.nextInvoiceNumber,
      })
      .from(eventFinancialSequences)
      .where(eq(eventFinancialSequences.eventId, input.eventId))
      .for("update");

    if (!sequence) {
      throw new Error("Expected event financial sequence to exist.");
    }

    let nextInvoiceNumber = sequence.nextInvoiceNumber;

    await tx.insert(academyEventChoreographyInvoices).values(
      eligibleChoreographies.map((choreography) => {
        const depositAmount = calculateDepositAmount({
          amount: choreography.basePriceAmount,
          percentage: requiredDepositPercentage,
        });

        return {
          academyId: input.academyId,
          basePriceAmount: choreography.basePriceAmount,
          choreographyId: choreography.id,
          createdByUserId: input.createdByUserId,
          depositAmount,
          eventId: input.eventId,
          invoiceNumber: nextInvoiceNumber++,
          invoiceType: "sena" as const,
          issueDate: input.issueDate,
          requiredDepositPercentageSnapshot: requiredDepositPercentage,
          selectedPaymentDeadline: choreography.selectedPaymentDeadline,
        };
      }),
    );

    await tx
      .update(eventFinancialSequences)
      .set({
        nextInvoiceNumber,
        updatedAt: new Date(),
      })
      .where(eq(eventFinancialSequences.eventId, input.eventId));
  });

  return {
    ok: true as const,
  };
}

export async function listActiveInvoiceChoreographyIds(
  choreographyIds: string[],
) {
  if (choreographyIds.length === 0) {
    return new Set<string>();
  }

  const rows = await db
    .select({
      choreographyId: academyEventChoreographyInvoices.choreographyId,
    })
    .from(academyEventChoreographyInvoices)
    .where(
      and(
        inArray(
          academyEventChoreographyInvoices.choreographyId,
          choreographyIds,
        ),
        isNull(academyEventChoreographyInvoices.cancelledAt),
      ),
    );

  return new Set(rows.map((row) => row.choreographyId));
}

export async function hasActiveInvoiceForChoreography(choreographyId: string) {
  const activeInvoiceIds = await listActiveInvoiceChoreographyIds([
    choreographyId,
  ]);

  return activeInvoiceIds.has(choreographyId);
}

// fallow-ignore-next-line complexity
async function validateDepositInvoiceInput(input: {
  academyId: string;
  choreographyIds: string[];
  eventId: string;
  issueDate: string;
}): Promise<DepositInvoiceValidationResult> {
  const choreographyIds = [...new Set(input.choreographyIds)];

  if (choreographyIds.length === 0) {
    return {
      ok: false,
      message: "Seleccioná al menos una Coreografía.",
      fieldErrors: {
        choreographyIds: "Seleccioná al menos una Coreografía.",
      },
    };
  }

  if (!input.issueDate) {
    return {
      ok: false,
      message: "Revisá los datos de la factura.",
      fieldErrors: {
        issueDate: "Ingresá la fecha de emisión.",
      },
    };
  }

  if (!isDateOnly(input.issueDate)) {
    return {
      ok: false,
      message: "Revisá los datos de la factura.",
      fieldErrors: {
        issueDate: "Ingresá una fecha válida.",
      },
    };
  }

  if (isFutureDateOnly(input.issueDate)) {
    return {
      ok: false,
      message: "Revisá los datos de la factura.",
      fieldErrors: {
        issueDate: "La fecha de emisión no puede ser futura.",
      },
    };
  }

  const event = await db.query.events.findFirst({
    columns: {
      id: true,
      requiredDepositPercentage: true,
    },
    where: eq(events.id, input.eventId),
  });

  if (!event) {
    throw new Error("Expected event to exist for deposit invoice issuance.");
  }

  const choreographyRows = await db
    .select({
      id: choreographies.id,
      name: choreographies.name,
      createdAt: choreographies.createdAt,
      groupType: choreographies.groupType,
      scheduleId: scheduleCapacities.scheduleId,
    })
    .from(choreographies)
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .where(
      and(
        eq(choreographies.academyId, input.academyId),
        eq(choreographies.eventId, input.eventId),
        inArray(choreographies.id, choreographyIds),
      ),
    );

  if (choreographyRows.length !== choreographyIds.length) {
    return {
      ok: false,
      message: "No pudimos resolver las Coreografías seleccionadas.",
      fieldErrors: {
        choreographyIds: "Revisá las Coreografías seleccionadas.",
      },
    };
  }

  const latestCreatedOn = choreographyRows.reduce<string | null>(
    (latest, choreography) => {
      const createdOn = choreography.createdAt.toISOString().slice(0, 10);
      return latest === null || createdOn > latest ? createdOn : latest;
    },
    null,
  );

  if (latestCreatedOn && input.issueDate < latestCreatedOn) {
    return {
      ok: false,
      message: "Revisá los datos de la factura.",
      fieldErrors: {
        issueDate:
          "La fecha de emisión no puede ser anterior a la creación de la Coreografía más reciente seleccionada.",
      },
    };
  }

  const activeInvoiceIds =
    await listActiveInvoiceChoreographyIds(choreographyIds);

  if (activeInvoiceIds.size > 0) {
    return {
      ok: false,
      message:
        "Ya existe una factura de seña activa para alguna de las Coreografías seleccionadas.",
      fieldErrors: {
        choreographyIds:
          "Ya existe una factura de seña activa para alguna de las Coreografías seleccionadas.",
      },
    };
  }

  const resolvedChoreographies = await Promise.all(
    choreographyRows.map(async (choreography) => {
      const priceResult = await resolveApplicablePrice({
        eventId: input.eventId,
        groupType: choreography.groupType,
        paymentDate: input.issueDate,
        scheduleId: choreography.scheduleId,
      });

      if (!priceResult.ok) {
        throw new Error(
          `No applicable price found for choreography ${choreography.id}.`,
        );
      }

      return {
        basePriceAmount: priceResult.price.amount,
        createdOn: choreography.createdAt.toISOString().slice(0, 10),
        id: choreography.id,
        name: choreography.name,
        selectedPaymentDeadline: priceResult.price.paymentDeadline,
      };
    }),
  );

  return {
    ok: true,
    choreographies: resolvedChoreographies,
    event: {
      id: event.id,
      requiredDepositPercentage: event.requiredDepositPercentage,
    },
  };
}

function calculateDepositAmount(input: { amount: number; percentage: number }) {
  return Math.round((input.amount * input.percentage) / 100);
}
