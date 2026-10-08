import { describe, expect, test } from "vitest";

import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { seedFinalistsFixture } from "@/lib/grand-final/voting.test-support";
import { readCurrentVotingRound } from "@/lib/grand-final/voting-round.server";

import {
  handleGrandFinalListAction,
  loadGrandFinalListRouteData,
} from "../list/server";
import { closeVotingRoundIntent, openVotingRoundIntent } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const listUrl = "http://localhost/administracion/gran-final";

async function submit(intent: string, role: "admin" | "auditor" = "admin") {
  const body = new FormData();
  body.set("intent", intent);
  const { request } = await createSignedInRequest({
    body,
    email: `${role}.${crypto.randomUUID()}@example.com`,
    requestUrl: listUrl,
    role,
  });

  return await handleGrandFinalListAction(request);
}

async function loadTheList() {
  const { request } = await createSignedInRequest({
    email: `admin.${crypto.randomUUID()}@example.com`,
    requestUrl: listUrl,
    role: "admin",
  });

  return await loadGrandFinalListRouteData(request);
}

describe("the voting round on the `Gran final` list", () => {
  test("lists why it cannot open while a finalist lacks banners, and refuses the open naming it", async () => {
    const fixture = await seedFinalistsFixture();
    await fixture.addFinalist("Ritmo Sur", 1);

    const { votingRound } = await loadTheList();

    expect(votingRound).toEqual({
      closeBlockReasons: [
        { code: "not-open", label: "La votación no está abierta." },
      ],
      openBlockReasons: [
        {
          code: "missing-banners",
          label:
            "Faltan banners de Ritmo Sur: cada finalista necesita sus dos banners.",
        },
      ],
      status: null,
    });
    await expect(submit(openVotingRoundIntent)).resolves.toMatchObject({
      data: {
        message:
          "No se puede abrir la votación. Faltan banners de Ritmo Sur: cada finalista necesita sus dos banners.",
        status: "error",
      },
      init: { status: 409 },
    });
    await expect(readCurrentVotingRound(fixture.eventId)).resolves.toBeNull();
  });

  test("opens, then closes, and the list reads each state", async () => {
    const fixture = await seedFinalistsFixture();
    await fixture.addFinalist("Ritmo Sur");

    await expect(submit(openVotingRoundIntent)).resolves.toEqual({
      message:
        "Abriste la votación. El público ya puede votar con sus códigos QR.",
      status: "success",
    });
    await expect(loadTheList()).resolves.toMatchObject({
      votingRound: {
        closeBlockReasons: [],
        openBlockReasons: [{ code: "already-open" }],
        status: "open",
      },
    });

    await expect(submit(closeVotingRoundIntent)).resolves.toEqual({
      message: "Cerraste la votación. Ya no se aceptan votos.",
      status: "success",
    });
    await expect(loadTheList()).resolves.toMatchObject({
      votingRound: {
        closeBlockReasons: [{ code: "not-open" }],
        openBlockReasons: [{ code: "already-closed" }],
        status: "closed",
      },
    });
  });

  test("refuses to close a round that is not open", async () => {
    await seedFinalistsFixture();

    await expect(submit(closeVotingRoundIntent)).resolves.toMatchObject({
      data: {
        message: "No se puede cerrar la votación. La votación no está abierta.",
      },
      init: { status: 409 },
    });
  });

  test("turns the auditor away from opening and closing", async () => {
    const fixture = await seedFinalistsFixture();
    await fixture.addFinalist("Ritmo Sur");

    await expectThrownResponse(submit(openVotingRoundIntent, "auditor"), 403);
    await expectThrownResponse(submit(closeVotingRoundIntent, "auditor"), 403);
    await expect(readCurrentVotingRound(fixture.eventId)).resolves.toBeNull();
  });
});
