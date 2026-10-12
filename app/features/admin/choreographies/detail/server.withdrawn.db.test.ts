import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographies, choreographyDancers } from "@/db/schema";
import { toSavedChoreographyDraft } from "@/features/admin/choreographies/detail/draft-form";
import {
  resolveChoreographyDraftIntent,
  saveChoreographyDraftIntent,
  toChoreographyDraftFormData,
  type ChoreographyDraft,
} from "@/features/admin/choreographies/detail/draft.shared";
import {
  createAcademySession,
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
  createSelectedPriceInscriptionForTest,
} from "@/features/portal/choreographies/test-support/db";
import { expectThrownResponse } from "@/lib/test-support/http";
import {
  loadDetail,
  submitDetailAction,
  deleteFormData,
} from "@/features/admin/choreographies/detail/server.test-support";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

function restoreIntentFormData() {
  const formData = new FormData();
  formData.set("intent", "restore-choreography");
  return formData;
}

describe("administrative choreography detail: a withdrawn choreography", () => {
  // A withdrawn choreography is not taking part, and a withdrawal is final
  // (#1496): nothing about it is edited while the stamp is there, and nothing
  // brings it back. The hidden controls are not the rule: every write is
  // refused on the server.
  test("refuses every write while the choreography is withdrawn", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Solo Lectura",
      email: "admin.coreografias.retirada.solo-lectura.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const withdrawn = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Retirada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const funded = await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      allocatedAmount: 4000,
      choreographyId: withdrawn.id,
      eventId: event.id,
    });

    await submitDetailAction({
      body: deleteFormData(),
      choreographyId: withdrawn.id,
      email: "admin.coreografias.retirada.solo-lectura.retiro@example.com",
      role: "admin",
    });

    const detail = await loadDetail({
      choreographyId: withdrawn.id,
      email: "admin.coreografias.retirada.solo-lectura.detalle@example.com",
      role: "admin",
    });
    // Every field of the form goes read-only with `canEdit`, and `Eliminar`
    // is offered only to say why it is blocked: the withdrawal is final.
    expect(detail.canEdit).toBe(false);
    expect(detail.deletion).toMatchObject({
      blockers: [{ code: "withdrawn" }],
      canDelete: false,
      isOffered: true,
    });

    const saved = toSavedChoreographyDraft(detail.choreography);
    const draftBody = (
      draft: ChoreographyDraft,
      intent:
        | typeof resolveChoreographyDraftIntent
        | typeof saveChoreographyDraftIntent,
    ) => toChoreographyDraftFormData({ draft, intent });
    const refusedWrites: Array<[string, FormData]> = [
      ["preview", draftBody(saved, resolveChoreographyDraftIntent)],
      [
        "rename",
        draftBody(
          { ...saved, name: "Nombre nuevo" },
          saveChoreographyDraftIntent,
        ),
      ],
      [
        "roster",
        draftBody(
          { ...saved, dancerIds: [funded.dancerId] },
          saveChoreographyDraftIntent,
        ),
      ],
      // A withdrawn choreography is never removed again: there is no second
      // outcome left for it.
      ["delete", deleteFormData()],
      // `Restaurar coreografía` is retired: its old intent is one more write.
      ["restore", restoreIntentFormData()],
    ];

    for (const [label, body] of refusedWrites) {
      await expectThrownResponse(
        submitDetailAction({
          body,
          choreographyId: withdrawn.id,
          email: `admin.coreografias.retirada.solo-lectura.${label}@example.com`,
          role: "admin",
        }),
        403,
      );
    }

    // Nothing moved: not the name the rename aimed at, not the roster, and not
    // the withdrawal itself.
    await expect(
      db.query.choreographies.findFirst({
        columns: { name: true },
        where: eq(choreographies.id, withdrawn.id),
      }),
    ).resolves.toEqual({ name: "Retirada" });
    await expect(
      db.query.choreographyDancers.findFirst({
        columns: { withdrawnAt: true },
        where: eq(choreographyDancers.id, funded.id),
      }),
    ).resolves.toMatchObject({ withdrawnAt: expect.any(Date) });
  });
});
