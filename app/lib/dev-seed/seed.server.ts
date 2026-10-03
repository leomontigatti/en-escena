import { addDays } from "date-fns/addDays";
import { format } from "date-fns/format";
import { parse } from "date-fns/parse";
import { and, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  categories,
  categoryModalities,
  choreographies,
  choreographyDancers,
  events,
  modalities,
  presentations,
  prices,
  scheduleCapacities,
  scheduleModalities,
  schedules,
  submodalities,
  user,
} from "@/db/schema";
import { createAccessUser } from "@/lib/auth/access-auth.test-support";
import type { InternalUserRole } from "@/lib/auth/internal-user-roles";
import { createChoreographyRegistration } from "@/lib/choreographies/registration-confirmation.server";
import { choreographyAnchor } from "@/lib/comprobantes/anchor";
import {
  ArcaClient,
  type ArcaBillingPort,
} from "@/lib/comprobantes/arca/client.server";
import { FACTURA_C_CBTE_TIPO } from "@/lib/comprobantes/arca/factura-c";
import { emitFacturaC } from "@/lib/comprobantes/emit-factura-c.server";
import { deleteSeededRows } from "@/lib/dev-seed/delete-seeded-rows.server";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import { registerAcademyEventPayment } from "@/features/admin/finances/academy-choreographies/payments.server";
import { allocateToInscription } from "@/lib/finances/inscription-allocation.server";
import { setPresentationDisqualified } from "@/lib/judging/score-settlement.server";
import { saveJudgeScore } from "@/lib/judging/save-score.server";
import { assignJudges } from "@/lib/presentations/judge-assignments.server";
import { runAutomaticOrdering } from "@/lib/presentations/participation.server";
import { createDancerForAcademy } from "@/lib/portal/dancers.server";
import { createAcademyProfessor } from "@/lib/portal/professors.server";

// Local demo data for `pnpm db:seed`: one account per role that can sign in,
// three events and a registrable catalog on the active one, so a browser
// session has something to look at without a production dump
// (docs/local-auth.md).
//
// Re-running it resets the demo: every row hanging off the seeded accounts and
// the seeded event names is deleted first, including whatever was created on
// them through the UI since the last run.

export const DEV_SEED_ADMIN_EMAIL = "admin@enescena.local";
export const DEV_SEED_ACADEMY_EMAIL = "academia@enescena.local";
export const DEV_SEED_AUDITOR_EMAIL = "auditoria@enescena.local";
export const DEV_SEED_JUDGE_EMAIL = "jurado@enescena.local";
export const DEV_SEED_PASSWORD = "demo-en-escena";

const seededEmails = [
  DEV_SEED_ADMIN_EMAIL,
  DEV_SEED_ACADEMY_EMAIL,
  DEV_SEED_AUDITOR_EMAIL,
  DEV_SEED_JUDGE_EMAIL,
];
const seededEventNames = {
  active: "Evento Activo",
  future: "Evento Futuro",
  finished: "Evento Finalizado",
} as const;

type DevSeedResult = {
  // Events outside the seed that were active and had to give way, since only
  // one event can be active at a time.
  deactivatedEventNames: string[];
};

export async function seedDevData(input: {
  now: Date;
}): Promise<DevSeedResult> {
  await deleteSeededRows({
    emails: seededEmails,
    eventNames: Object.values(seededEventNames),
  });

  await createVerifiedUser({
    email: DEV_SEED_ADMIN_EMAIL,
    name: "Administración Demo",
    role: "admin",
  });
  // The auditor and judge panels (`/auditoria`, `/juzgamiento`) are only
  // reachable with these roles, so a browser check of their headers needs them.
  await createVerifiedUser({
    email: DEV_SEED_AUDITOR_EMAIL,
    name: "Auditoría Demo",
    role: "auditor",
  });
  const judgeUserId = await createVerifiedUser({
    email: DEV_SEED_JUDGE_EMAIL,
    name: "Jurado Demo",
    role: "judge",
  });
  const academyUserId = await createVerifiedUser({
    email: DEV_SEED_ACADEMY_EMAIL,
    name: "Academia Demo",
    role: "academy",
  });
  const [academy] = await db
    .insert(academies)
    .values({
      userId: academyUserId,
      name: "Academia Demo",
      contactName: "Carla Gómez",
      phone: "1155550000",
      city: "Rosario",
      province: "Santa Fe",
    })
    .returning();

  const activeEvent = await createSeedEvent(
    seededEventNames.active,
    addDays(input.now, 60),
  );
  await createSeedEvent(seededEventNames.future, addDays(input.now, 365));
  await createSeedEvent(seededEventNames.finished, addDays(input.now, -60));

  const deactivated = await db
    .update(events)
    .set({ active: false })
    .where(and(eq(events.active, true), ne(events.id, activeEvent.id)))
    .returning({ name: events.name });
  expectOk(await activateEvent(activeEvent.id), "activate the active event");

  const catalog = await createCatalog(activeEvent);
  const roster = await createRoster(academy.id);
  const registration = {
    academyId: academy.id,
    eventId: activeEvent.id,
    catalog,
  };
  // Ana's in the morning block, Bea's in the afternoon: the afternoon one is
  // judged below, and a judged choreography freezes its whole schedule, so
  // keeping them apart leaves Ana's open to correction.
  await registerSolo({
    ...registration,
    name: "Luna de Papel",
    dancerId: roster.ana,
    professorId: roster.luz,
    scheduleCapacityId: catalog.morningCapacity.id,
  });
  const disqualifiedChoreographyId = await registerSolo({
    ...registration,
    name: "Viento Sur",
    dancerId: roster.bea,
    professorId: roster.nora,
    scheduleCapacityId: catalog.afternoonCapacity.id,
  });
  // Scored in the block the disqualification freezes anyway, and under its own
  // submodality: a score locks the criteria of the submodality it was given
  // in, and `Lírico` has to keep its criteria editable.
  const scoredChoreographyId = await registerSolo({
    ...registration,
    name: "Río Arriba",
    dancerId: roster.caro,
    professorId: roster.nora,
    scheduleCapacityId: catalog.afternoonCapacity.id,
    submodalityId: catalog.scoredSubmodality.id,
  });
  await coverDeposits({
    academyId: academy.id,
    eventId: activeEvent.id,
    now: input.now,
    priceId: catalog.priceId,
  });
  // Registered after the payment, so nothing is allocated to it: the unpaid
  // inscription the money screens need. With no deposit it gets no number, so
  // it freezes nothing in the morning block.
  await registerSolo({
    ...registration,
    name: "Sal y Arena",
    dancerId: roster.dani,
    professorId: roster.luz,
    scheduleCapacityId: catalog.morningCapacity.id,
  });
  await invoiceChoreography({
    choreographyId: scoredChoreographyId,
    eventId: activeEvent.id,
  });
  await judgeAfternoonSchedule({
    disqualifiedChoreographyId,
    scoredChoreographyId,
    eventId: activeEvent.id,
    judgeUserId,
    scheduledDate: catalog.scheduledDate,
  });

  return { deactivatedEventNames: deactivated.map(({ name }) => name) };
}

async function createVerifiedUser(input: {
  email: string;
  name: string;
  role: "academy" | InternalUserRole;
}) {
  // Real Better Auth sign-up, so the password hash is the one sign-in checks.
  const { user: created } = await createAccessUser({
    email: input.email,
    name: input.name,
    password: DEV_SEED_PASSWORD,
  });

  await db
    .update(user)
    .set({ emailVerified: true, role: input.role })
    .where(eq(user.id, created.id));

  return created.id;
}

async function createSeedEvent(name: string, startsAt: Date) {
  const result = await createEvent({
    name,
    startsAt,
    endsAt: addDays(startsAt, 2),
  });

  return expectOk(result, `create ${name}`).event;
}

async function createCatalog(event: { id: string; startsAt: Date }) {
  const eventId = event.id;
  const [modality] = await db
    .insert(modalities)
    .values({ eventId, name: "Jazz" })
    .returning();
  const [submodality, scoredSubmodality] = await db
    .insert(submodalities)
    .values([
      { eventId, modalityId: modality.id, name: "Lírico" },
      { eventId, modalityId: modality.id, name: "Contemporáneo" },
    ])
    .returning();
  // Readiness wants the age ladder to cover 1 to 100 with no gap.
  const seededCategories = await db
    .insert(categories)
    .values([
      {
        eventId,
        name: "Infantil",
        minAge: 1,
        maxAge: 12,
        groupTypes: ["solo"],
        groupTypeKey: "solo",
        experienceLevels: ["amateur"],
        experienceLevelKey: "amateur",
      },
      {
        eventId,
        name: "Juvenil y adultos",
        minAge: 13,
        maxAge: 100,
        groupTypes: ["solo"],
        groupTypeKey: "solo",
        experienceLevels: [],
        experienceLevelKey: "",
      },
    ])
    .returning();
  await db.insert(categoryModalities).values(
    seededCategories.map((category) => ({
      categoryId: category.id,
      modalityId: modality.id,
    })),
  );
  const scheduledDate = format(event.startsAt, "yyyy-MM-dd");
  const [morningCapacity, afternoonCapacity] = await Promise.all(
    [
      { name: "Bloque mañana", startTime: "10:00" },
      { name: "Bloque tarde", startTime: "16:00" },
    ].map((schedule) =>
      createSoloSchedule({
        eventId,
        modalityId: modality.id,
        scheduledDate,
        ...schedule,
      }),
    ),
  );
  const [price] = await db
    .insert(prices)
    .values({
      eventId,
      name: "Precio solista",
      groupType: "solo",
      amount: 25000,
      paymentDeadline: null,
    })
    .returning();

  return {
    modality,
    submodality,
    scoredSubmodality,
    morningCapacity,
    afternoonCapacity,
    priceId: price.id,
    scheduledDate,
  };
}

async function createSoloSchedule(input: {
  eventId: string;
  modalityId: string;
  name: string;
  scheduledDate: string;
  startTime: string;
}) {
  const [schedule] = await db
    .insert(schedules)
    .values({
      eventId: input.eventId,
      name: input.name,
      scheduledDate: input.scheduledDate,
      startTime: input.startTime,
      totalCapacity: 20,
      registrationOpen: true,
    })
    .returning();
  await db
    .insert(scheduleModalities)
    .values({ scheduleId: schedule.id, modalityId: input.modalityId });
  const [scheduleCapacity] = await db
    .insert(scheduleCapacities)
    .values({ scheduleId: schedule.id, groupType: "solo", capacity: 10 })
    .returning();

  return scheduleCapacity;
}

async function createRoster(academyId: string) {
  const noDocument = { documentType: "", documentNumber: "" };
  const dancerIds: string[] = [];
  for (const dancer of [
    { firstName: "Ana", lastName: "Paz", birthDate: "2012-03-14" },
    { firstName: "Bea", lastName: "Lagos", birthDate: "2010-07-02" },
    { firstName: "Caro", lastName: "Vera", birthDate: "2009-01-30" },
    { firstName: "Dani", lastName: "Rey", birthDate: "2011-11-23" },
  ]) {
    const result = await createDancerForAcademy(academyId, {
      ...dancer,
      ...noDocument,
    });
    dancerIds.push(expectOk(result, `create ${dancer.firstName}`).dancer.id);
  }

  const professorIds: string[] = [];
  for (const professor of [
    { firstName: "Luz", lastName: "Suárez" },
    { firstName: "Nora", lastName: "Díaz" },
  ]) {
    const result = await createAcademyProfessor(academyId, {
      ...professor,
      ...noDocument,
    });
    professorIds.push(
      expectOk(result, `create ${professor.firstName}`).professor.id,
    );
  }

  const [ana, bea, caro, dani] = dancerIds;
  const [luz, nora] = professorIds;

  return { ana, bea, caro, dani, luz, nora };
}

type SeedRegistration = {
  academyId: string;
  eventId: string;
  catalog: Awaited<ReturnType<typeof createCatalog>>;
  name: string;
  dancerId: string;
  professorId: string;
  scheduleCapacityId: string;
  /** Defaults to the catalog's first submodality. */
  submodalityId?: string;
};

async function registerSolo(input: SeedRegistration) {
  const registration = expectOk(
    await createChoreographyRegistration({
      academyId: input.academyId,
      eventId: input.eventId,
      name: input.name,
      modalityId: input.catalog.modality.id,
      submodalityId: input.submodalityId ?? input.catalog.submodality.id,
      dancerIds: [input.dancerId],
      professorIds: [input.professorId],
      experienceLevelId: null,
      scheduleCapacityId: input.scheduleCapacityId,
    }),
    `register ${input.name}`,
  );

  return registration.choreography.id;
}

/**
 * One payment covering every inscription past its deposit (30% of 25000).
 * Crossing the deposit locks the inscription's price and the allocation locks
 * the payment's academy.
 */
async function coverDeposits(input: {
  academyId: string;
  eventId: string;
  now: Date;
  priceId: string;
}) {
  const perInscription = 10000;
  const inscriptions = await db
    .select({
      choreographyId: choreographyDancers.choreographyId,
      id: choreographyDancers.id,
    })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .where(eq(choreographies.academyId, input.academyId));

  await registerAcademyEventPayment({
    academyId: input.academyId,
    amount: perInscription * inscriptions.length,
    eventId: input.eventId,
    internalNote: null,
    paymentDate: format(input.now, "yyyy-MM-dd"),
    paymentMethod: "transferencia",
    reference: null,
  });

  for (const inscription of inscriptions) {
    expectOk(
      await allocateToInscription({
        academyId: input.academyId,
        amount: perInscription,
        choreographyId: inscription.choreographyId,
        eventId: input.eventId,
        inscriptionId: inscription.id,
        priceId: input.priceId,
      }),
      "allocate a deposit",
    );
  }
}

// A sales point no real issuer configuration uses, so the demo invoice's number
// cannot collide with a comprobante a production refresh brought in: the
// unique index is on sales point, type and number.
const DEMO_SALES_POINT = 9999;

// The CAE of the WSFEv1 manual's own example and a placeholder issuer CUIT, not
// the association's: the printed comprobante and its QR must not pass for one
// the real issuer emitted.
const DEMO_CAE = "41124578989845";
const DEMO_ISSUER_CUIT = "20000000001";
// ARCA's id for `Consumidor Final`, the recipient every `Factura C` here has.
const DEMO_RECEPTOR_IVA_CONDITION_ID = 5;

// Stands in for ARCA: the sales point has issued nothing, and every request is
// authorized as asked, with a CAE that expires ten days on as a real one
// does. No network, no certificate.
const demoBilling: ArcaBillingPort = {
  getLastVoucher: async () => ({
    cbteNro: 0,
    cbteTipo: FACTURA_C_CBTE_TIPO,
    ptoVta: DEMO_SALES_POINT,
  }),
  createVoucher: async (request) => {
    const caeFchVto = format(
      addDays(parse(request.CbteFch, "yyyyMMdd", new Date()), 10),
      "yyyyMMdd",
    );

    return {
      cae: DEMO_CAE,
      caeFchVto,
      response: {
        FeCabResp: { Resultado: "A" },
        FeDetResp: {
          FECAEDetResponse: [
            {
              CbteDesde: request.CbteDesde,
              CbteHasta: request.CbteHasta,
              CbteFch: request.CbteFch,
              Resultado: "A",
              CAE: DEMO_CAE,
              CAEFchVto: caeFchVto,
            },
          ],
        },
      },
    };
  },
  getVoucherInfo: async () => null,
};

/**
 * Emits a `Factura C` for what the choreography has paid, through the real
 * emission: the comprobante, its lines and its snapshot are the ones the UI
 * would have produced. Only the authorization is a stand-in, so the CAE and
 * the QR it prints are not a fiscal document.
 */
async function invoiceChoreography(input: {
  choreographyId: string;
  eventId: string;
}) {
  expectOk(
    await emitFacturaC(
      {
        anchor: choreographyAnchor(input.choreographyId),
        eventId: input.eventId,
      },
      {
        client: new ArcaClient(demoBilling),
        ptoVta: DEMO_SALES_POINT,
        issuerCuit: DEMO_ISSUER_CUIT,
        receptorIvaConditionId: DEMO_RECEPTOR_IVA_CONDITION_ID,
      },
    ),
    "invoice the scored choreography",
  );
}

/**
 * Numbers the event and closes both afternoon presentations: administration
 * disqualifies one and the demo judge scores the other. Either counts as
 * evaluated, which freezes every number in that schedule. Judges only write on
 * the schedule's own day, so the score is dated then.
 */
async function judgeAfternoonSchedule(input: {
  disqualifiedChoreographyId: string;
  scoredChoreographyId: string;
  eventId: string;
  judgeUserId: string;
  scheduledDate: string;
}) {
  const choreographyIds = [
    input.disqualifiedChoreographyId,
    input.scoredChoreographyId,
  ];
  expectOk(await runAutomaticOrdering(input.eventId), "order the event");
  await assignJudges({ choreographyIds, judgeIds: [input.judgeUserId] });
  const numbered = await db
    .select({
      id: presentations.id,
      choreographyId: presentations.choreographyId,
    })
    .from(presentations)
    .where(inArray(presentations.choreographyId, choreographyIds));
  const presentationOf = (choreographyId: string) => {
    const presentation = numbered.find(
      (row) => row.choreographyId === choreographyId,
    );
    if (!presentation) {
      throw new Error(`Dev seed found no presentation for ${choreographyId}.`);
    }
    return presentation.id;
  };
  const now = new Date(`${input.scheduledDate}T15:00:00Z`);

  expectOk(
    await setPresentationDisqualified({
      disqualified: true,
      presentationId: presentationOf(input.disqualifiedChoreographyId),
    }),
    "disqualify the afternoon presentation",
  );
  expectOk(
    await saveJudgeScore({
      judgeId: input.judgeUserId,
      now,
      presentationId: presentationOf(input.scoredChoreographyId),
      value: "87",
    }),
    "score the afternoon presentation",
  );
}

function expectOk<Result extends { ok: boolean }>(
  result: Result,
  step: string,
): Extract<Result, { ok: true }> {
  if (!result.ok) {
    throw new Error(`Dev seed could not ${step}: ${JSON.stringify(result)}`);
  }

  return result as Extract<Result, { ok: true }>;
}
