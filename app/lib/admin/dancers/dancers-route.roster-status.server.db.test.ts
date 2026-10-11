import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographyDancers } from "@/db/schema";
import {
  getInitialDialogIntent,
  type DancerActionError,
} from "@/features/admin/dancers/detail/shared";
import { expectPersistedDancer } from "@/lib/test-support/person-detail-db-assertions";
import { createAcademyUser } from "@/lib/test-support/academies";
import {
  action as detailAction,
  loader as detailLoader,
} from "@/routes/administracion.bailarines_.$dancerId";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { expectThrownResponse } from "@/lib/test-support/http";
import { createSavedEvent } from "@/lib/test-support/events";
import {
  createDancer,
  linkDancerToEventChoreography,
  detailRouteArgs,
} from "@/lib/admin/dancers/dancers-route.test-support";
import { createPostRequest } from "@/lib/admin/test-support/route";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

const createDocumentImageSignedUrlMock = vi.hoisted(() => vi.fn());

// Only the factory is replaced: the shared read path stays real, so the admin
// surface is exercised through the same loader the portal uses (#571).
vi.mock("@/lib/storage/dancer-documents.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/storage/dancer-documents.server")
  >()),
  createDefaultDancerDocumentStorage: () => ({
    createDocumentImageSignedUrl: createDocumentImageSignedUrlMock,
  }),
}));

installDatabaseTestHooks();

beforeEach(() => {
  createDocumentImageSignedUrlMock.mockReset();
  createDocumentImageSignedUrlMock.mockImplementation(
    async (storageKey: string) => `signed:${storageKey}`,
  );
});

describe("`/administracion/bailarines` route: archive and merge", () => {
  test("refuses to archive a dancer participating in the active event, as action data rather than a 404", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const academy = await createAcademyUser({
      email: "admin.archivo.bailarines.academia@example.com",
      academyName: "Academia Archivo Admin",
      contactName: "Ada Archivo",
      phone: "1111-0000",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Rosa",
      lastName: "Archivo",
      birthDate: "2014-01-20",
    });
    await linkDancerToEventChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      dancerId: dancer.id,
      choreographyName: "Persistencia",
    });
    const { request } = await createSignedInRequest({
      email: "admin.archivo.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}`,
    });

    const archiveResult = await detailAction(
      detailRouteArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "archive-dancer",
        }),
        dancer.id,
      ),
    );

    expect(archiveResult).toMatchObject({
      status: "error",
      message:
        "Este bailarín no puede archivarse porque está participando del evento activo.",
    });
    // A refused status change carries no submitted values, and re-opens no
    // dialog: the toast reports it, and the reloaded page already has
    // `Archivar` opening the blocked acknowledgment.
    expect(
      getInitialDialogIntent({
        actionData: archiveResult as DancerActionError,
        shouldConfirmSave: false,
      }),
    ).toBeNull();
    await expectPersistedDancer(dancer.id, { active: true });

    await expect(
      db
        .select()
        .from(choreographyDancers)
        .where(eq(choreographyDancers.dancerId, dancer.id)),
    ).resolves.toHaveLength(1);
  });

  test("archives and reactivates a dancer with no live commitment in the active event", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const academy = await createAcademyUser({
      email: "admin.archivo.libre.academia@example.com",
      academyName: "Academia Archivo Libre",
      contactName: "Ada Libre",
      phone: "1111-0001",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Lila",
      lastName: "Libre",
      birthDate: "2014-01-20",
    });
    const { request } = await createSignedInRequest({
      email: "admin.archivo.libre@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}`,
    });

    const archiveResult = await detailAction(
      detailRouteArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "archive-dancer",
        }),
        dancer.id,
      ),
    );

    expect(archiveResult).toMatchObject({
      status: "success",
      message: "Bailarín archivado.",
    });
    await expectPersistedDancer(dancer.id, { active: false });

    const archivedDetail = await detailLoader(
      detailRouteArgs(request, dancer.id),
    );
    expect(archivedDetail.dancer.active).toBe(false);

    const reactivateResult = await detailAction(
      detailRouteArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "reactivate-dancer",
        }),
        dancer.id,
      ),
    );

    expect(reactivateResult).toMatchObject({
      status: "success",
      message: "Bailarín reactivado.",
    });
    await expectPersistedDancer(dancer.id, { active: true });
  });

  test("merges a dancer into another of the academy and redirects to the survivor", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const academy = await createAcademyUser({
      email: "admin.fusion.bailarines.academia@example.com",
      academyName: "Academia Fusión Bailarines",
    });
    const survivor = await createDancer({
      academyId: academy.academy.id,
      firstName: "Lila",
      lastName: "Queda",
      birthDate: "2014-01-20",
    });
    const removed = await createDancer({
      academyId: academy.academy.id,
      firstName: "Lilita",
      lastName: "Queda",
      birthDate: "2014-01-20",
    });
    await linkDancerToEventChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      dancerId: removed.id,
      choreographyName: "Mudanza",
    });
    const { request } = await createSignedInRequest({
      email: "admin.fusion.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${removed.id}?evento=${event.id}`,
    });

    await expect(
      detailLoader(detailRouteArgs(request, removed.id)),
    ).resolves.toMatchObject({
      merge: {
        candidates: [expect.objectContaining({ id: survivor.id })],
        inscriptionsByEvent: [
          { choreographies: 1, eventName: event.name, seminars: 0 },
        ],
      },
    });

    const response = await detailAction(
      detailRouteArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          id: removed.id,
          intent: "merge-dancer",
          survivorId: survivor.id,
        }),
        removed.id,
      ),
    ).then(
      () => {
        throw new Error("Expected the merge to redirect.");
      },
      (thrown: unknown) => thrown as Response,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `/administracion/bailarines/${survivor.id}`,
    );
    await expect(
      db
        .select({ dancerId: choreographyDancers.dancerId })
        .from(choreographyDancers)
        .where(eq(choreographyDancers.dancerId, survivor.id)),
    ).resolves.toHaveLength(1);
  });

  test("offers no merge to an auditor and refuses the intent with a 403", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const academy = await createAcademyUser({
      email: "auditor.fusion.bailarines.academia@example.com",
      academyName: "Academia Fusión Auditor",
    });
    const survivor = await createDancer({
      academyId: academy.academy.id,
      firstName: "Lila",
      lastName: "Queda",
      birthDate: "2014-01-20",
    });
    const removed = await createDancer({
      academyId: academy.academy.id,
      firstName: "Lilita",
      lastName: "Queda",
      birthDate: "2014-01-20",
    });
    const { request } = await createSignedInRequest({
      email: "auditor.fusion.bailarines@example.com",
      role: "auditor",
      requestUrl: `http://localhost/administracion/bailarines/${removed.id}?evento=${event.id}`,
    });

    await expect(
      detailLoader(detailRouteArgs(request, removed.id)),
    ).resolves.toMatchObject({ merge: null });
    await expectThrownResponse(
      detailAction(
        detailRouteArgs(
          createPostRequest(request.url, request.headers.get("cookie") ?? "", {
            id: removed.id,
            intent: "merge-dancer",
            survivorId: survivor.id,
          }),
          removed.id,
        ),
      ),
      403,
    );
    await expectPersistedDancer(removed.id, { active: true });
  });
});
