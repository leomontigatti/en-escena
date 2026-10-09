import { describe, expect, test } from "vitest";

import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import {
  seedFinalistsFixture,
  seedResultFixture,
} from "@/lib/grand-final/voting.test-support";
import { readCurrentVotingRound } from "@/lib/grand-final/voting-round.server";

import {
  handleGrandFinalListAction,
  loadGrandFinalListRouteData,
} from "../list/server";
import {
  closeVotingRoundIntent,
  hideGrandFinalResultIntent,
  openTieBreakRoundIntent,
  openVotingRoundIntent,
  publishGrandFinalResultIntent,
} from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const listUrl = "http://localhost/administracion/gran-final";

async function submit(
  intent: string,
  role: "admin" | "auditor" = "admin",
  fields: Record<string, string> = {},
) {
  const body = new FormData();
  body.set("intent", intent);

  for (const [name, value] of Object.entries(fields)) {
    body.set(name, value);
  }

  const { request } = await createSignedInRequest({
    body,
    email: `${role}.${crypto.randomUUID()}@example.com`,
    requestUrl: listUrl,
    role,
  });

  return await handleGrandFinalListAction(request);
}

/** Closes the round the list shows, as its `Cerrar votación` dialog does. */
async function closeTheShownRound() {
  const { votingRound } = await loadTheList();

  return await submit(closeVotingRoundIntent, "admin", {
    roundId: votingRound?.roundId ?? "",
  });
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
      hideBlockReasons: [
        { code: "not-published", label: "El resultado no está publicado." },
      ],
      openBlockReasons: [
        {
          code: "missing-banners",
          label:
            "Faltan banners de Ritmo Sur: cada finalista necesita sus dos banners.",
        },
      ],
      publishBlockReasons: [
        { code: "no-round", label: "La votación todavía no se abrió." },
      ],
      result: null,
      roundId: null,
      status: null,
      tieBreakBlockReasons: [
        { code: "no-round", label: "La votación todavía no se abrió." },
      ],
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

    await expect(closeTheShownRound()).resolves.toEqual({
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

    await expect(closeTheShownRound()).resolves.toMatchObject({
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

describe("the result on the `Gran final` list", () => {
  test("shows no result while the round is open", async () => {
    const fixture = await seedResultFixture();
    await fixture.vote(fixture.alas, { voters: 1 });

    await expect(loadTheList()).resolves.toMatchObject({
      votingRound: {
        publishBlockReasons: [
          {
            code: "round-open",
            label:
              "La votación está abierta: el resultado se publica después de cerrarla.",
          },
        ],
        result: null,
        status: "open",
      },
    });
  });

  test("calls out a round 1 tie, refuses to publish it, and settles it with a Desempate", async () => {
    const fixture = await seedResultFixture();
    const tokens = await fixture.issueCodes(1);
    await fixture.vote(fixture.alas, { tokens });
    await fixture.vote(fixture.ritmo, { voters: 10 });
    await closeTheShownRound();

    await expect(loadTheList()).resolves.toMatchObject({
      votingRound: {
        publishBlockReasons: [
          {
            code: "tie-pending",
            label:
              "Hay un empate en el primer puesto: abrí el desempate antes de publicar.",
          },
        ],
        result: {
          outcome: { academyIds: [fixture.alas, fixture.ritmo], kind: "tie" },
          published: false,
          roundNumber: 1,
        },
        tieBreakBlockReasons: [],
      },
    });
    await expect(submit(publishGrandFinalResultIntent)).resolves.toMatchObject({
      data: {
        message:
          "No se puede publicar el resultado. Hay un empate en el primer puesto: abrí el desempate antes de publicar.",
      },
      init: { status: 409 },
    });

    await expect(submit(openTieBreakRoundIntent)).resolves.toEqual({
      message:
        "Abriste el desempate. El público ya puede votar entre las academias empatadas.",
      status: "success",
    });
    await expect(loadTheList()).resolves.toMatchObject({
      votingRound: { result: null, status: "open" },
    });

    await fixture.vote(fixture.alas, { voters: 1 });
    await closeTheShownRound();

    await expect(submit(publishGrandFinalResultIntent)).resolves.toEqual({
      message: "Publicaste el resultado. Ya se ve en /votar.",
      status: "success",
    });
    await expect(loadTheList()).resolves.toMatchObject({
      votingRound: {
        hideBlockReasons: [],
        publishBlockReasons: [{ code: "already-published" }],
        result: {
          outcome: { academyIds: [fixture.alas], kind: "winner" },
          published: true,
          roundNumber: 2,
        },
        tieBreakBlockReasons: [{ code: "already-tie-break" }],
      },
    });

    await expect(submit(hideGrandFinalResultIntent)).resolves.toEqual({
      message: "Ocultaste el resultado. Ya no se ve en /votar.",
      status: "success",
    });
    await expect(loadTheList()).resolves.toMatchObject({
      votingRound: { result: { published: false } },
    });
  });

  test("refuses a close confirmed over round 1 that arrives after the Desempate opened", async () => {
    const fixture = await seedResultFixture();
    await fixture.vote(fixture.alas, { voters: 1 });
    await fixture.vote(fixture.ritmo, { voters: 1 });
    const { votingRound: roundOne } = await loadTheList();
    await closeTheShownRound();
    await submit(openTieBreakRoundIntent);

    await expect(
      submit(closeVotingRoundIntent, "admin", {
        roundId: roundOne?.roundId ?? "",
      }),
    ).resolves.toMatchObject({
      data: {
        message: "No se puede cerrar la votación. La votación no está abierta.",
      },
      init: { status: 409 },
    });
    await expect(loadTheList()).resolves.toMatchObject({
      votingRound: { result: null, status: "open" },
    });
  });

  test("refuses a Desempate after a round 1 with one winner", async () => {
    const fixture = await seedResultFixture();
    await fixture.vote(fixture.alas, { voters: 1 });
    await closeTheShownRound();

    await expect(submit(openTieBreakRoundIntent)).resolves.toMatchObject({
      data: {
        message:
          "No se puede abrir el desempate. La votación no terminó con empate en el primer puesto.",
      },
      init: { status: 409 },
    });
  });

  test("turns the auditor away from the Desempate, publishing and hiding", async () => {
    const fixture = await seedResultFixture();
    await fixture.vote(fixture.alas, { voters: 1 });
    await closeTheShownRound();

    await expectThrownResponse(submit(openTieBreakRoundIntent, "auditor"), 403);
    await expectThrownResponse(
      submit(publishGrandFinalResultIntent, "auditor"),
      403,
    );
    await expectThrownResponse(
      submit(hideGrandFinalResultIntent, "auditor"),
      403,
    );
    await expect(
      readCurrentVotingRound(fixture.eventId),
    ).resolves.toMatchObject({ number: 1, publishedAt: null });
  });
});
