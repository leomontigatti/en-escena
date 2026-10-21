import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events } from "@/db/schema";
import {
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import { loadComprobanteDetail } from "@/features/admin/comprobantes/detail/server";
import { loadComprobantesList } from "@/features/admin/comprobantes/list/server";
import { comprobanteStatusSearchValues } from "@/features/admin/comprobantes/list/shared";
import type { ComprobanteStatus } from "@/lib/comprobantes/comprobante-status.server";
import { facturaCInput } from "@/lib/comprobantes/comprobante-emission.test-support";
import {
  recordComprobante,
  type RecordComprobanteInput,
} from "@/lib/comprobantes/comprobantes.server";
import { createSignedInRequest } from "@/lib/test-support/auth";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

// The two derivations of an invoice's status — the list's SQL and the detail's
// TypeScript — held to one answer on every row of #657's fixture set. The
// cross-event row is the one the list's old event condition got wrong.

let nextCbteNro = 1;

async function seedChoreography(
  eventId: string,
  catalog: Awaited<ReturnType<typeof createEventCatalog>>,
  name: string,
) {
  const academy = await createAcademyRecord({
    academyName: `Academia ${name}`,
    email: `${crypto.randomUUID()}@example.com`,
  });

  return await createChoreographyRecord({
    academyId: academy.id,
    eventId,
    modalityId: catalog.modality.id,
    categoryId: catalog.categoryWithoutLevel.id,
    scheduleCapacityId: catalog.scheduleCapacity.id,
    name,
  });
}

async function record(
  choreographyId: string,
  eventId: string,
  input: Partial<RecordComprobanteInput> = {},
) {
  return await recordComprobante(
    facturaCInput({
      choreographyId,
      eventId,
      cbteNro: nextCbteNro++,
      ...input,
    }),
  );
}

async function adminRequest(search = "") {
  const { request } = await createSignedInRequest({
    email: `parity.${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost/administracion/comprobantes${search}`,
    role: "admin",
  });

  return request;
}

async function activate(eventId: string) {
  await db.update(events).set({ active: false });
  await db.update(events).set({ active: true }).where(eq(events.id, eventId));
}

const statuses: ComprobanteStatus[] = ["valid", "adjusted", "annulled"];

/**
 * Every row of the active event as the list sees it — its status, and the
 * `Estado` facet it is found under — beside the detail's status for it.
 */
async function readBothDerivations() {
  const list = await loadComprobantesList(await adminRequest());
  const facetOf = new Map<string, ComprobanteStatus>();

  for (const status of statuses) {
    const filtered = await loadComprobantesList(
      await adminRequest(`?estado=${comprobanteStatusSearchValues[status]}`),
    );
    for (const row of filtered.rows) {
      facetOf.set(row.id, status);
    }
  }

  return await Promise.all(
    list.rows.map(async (row) => {
      const detail = await loadComprobanteDetail(await adminRequest(), row.id);

      return {
        id: row.id,
        list: row.status,
        facet: facetOf.get(row.id) ?? null,
        detail: detail.comprobante.status,
      };
    }),
  );
}

describe("the status's two derivations", () => {
  test("agree on every row: list badge, `Estado` facet and detail badge", async () => {
    const eventA = await createEventRecord({ name: "Evento A" });
    const eventB = await createEventRecord({ name: "Evento B" });
    // Two anchors in one event, and a third in another.
    const catalogA = await createEventCatalog(eventA.id);
    const catalogB = await createEventCatalog(eventB.id);
    const first = await seedChoreography(eventA.id, catalogA, "Primera");
    const second = await seedChoreography(eventA.id, catalogA, "Segunda");
    const other = await seedChoreography(eventB.id, catalogB, "Otra");

    const plain = await record(first.id, eventA.id);
    const debited = await record(first.id, eventA.id);
    const debitNote = await record(first.id, eventA.id, {
      cbteTipo: 12,
      impTotal: 2000,
      associatedComprobanteId: debited.id,
    });
    const partiallyCredited = await record(second.id, eventA.id);
    const partialCredit = await record(second.id, eventA.id, {
      cbteTipo: 13,
      impTotal: 4000,
      associatedComprobanteId: partiallyCredited.id,
    });
    const fullyCredited = await record(second.id, eventA.id);
    const fullCredit = await record(second.id, eventA.id, {
      cbteTipo: 13,
      associatedComprobanteId: fullyCredited.id,
    });
    const unknownKind = await record(second.id, eventA.id, { cbteTipo: 99 });
    // An invoice whose full credit note was recorded under another event: the
    // list used to scope the note to the selected event and call it `valid`.
    const creditedElsewhere = await record(second.id, eventA.id);
    const creditElsewhere = await record(second.id, eventB.id, {
      cbteTipo: 13,
      associatedComprobanteId: creditedElsewhere.id,
    });
    const otherEventFactura = await record(other.id, eventB.id);

    const expected = new Map<string, ComprobanteStatus | null>([
      [plain.id, "valid"],
      [debited.id, "adjusted"],
      [debitNote.id, null],
      [partiallyCredited.id, "adjusted"],
      [partialCredit.id, null],
      [fullyCredited.id, "annulled"],
      [fullCredit.id, null],
      [unknownKind.id, null],
      [creditedElsewhere.id, "annulled"],
      [creditElsewhere.id, null],
      [otherEventFactura.id, "valid"],
    ]);

    await activate(eventA.id);
    const rowsOfA = await readBothDerivations();
    await activate(eventB.id);
    const rowsOfB = await readBothDerivations();
    const rows = [...rowsOfA, ...rowsOfB];

    expect(rows.map((row) => row.id).sort()).toEqual(
      [...expected.keys()].sort(),
    );

    for (const row of rows) {
      const status = expected.get(row.id);

      expect(row).toEqual({
        id: row.id,
        list: status,
        facet: status,
        detail: status,
      });
    }
  });
});
