import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { votes } from "@/db/schema";
import { voidVoteCodeBatch } from "@/lib/grand-final/vote-codes.server";
import {
  seedFinalistsFixture,
  seedOpenRoundFixture,
} from "@/lib/grand-final/voting.test-support";
import { closeVotingRound } from "@/lib/grand-final/voting-round.server";
import { createFilesystemGrandFinalBannerStorage } from "@/lib/storage/grand-final-banners.server";

import { handleVoteAction, loadVotePage } from "./server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

// Signing a picture's URL reads nothing from the volume.
const storage = createFilesystemGrandFinalBannerStorage({
  baseDir: "/volumen-de-prueba",
  now: () => 1_000_000,
  secret: "volume-signing-secret",
});

async function load(query = "") {
  const answer = await loadVotePage(
    new Request(`http://localhost/votar${query}`),
    storage,
  );

  return {
    cacheControl: new Headers(answer.init?.headers).get("Cache-Control"),
    page: answer.data,
  };
}

async function vote(input: { academyId: string; codigo: string }) {
  const body = new FormData();
  body.set("academyId", input.academyId);
  body.set("codigo", input.codigo);

  try {
    const answer = await handleVoteAction(
      new Request("http://localhost/votar", { body, method: "POST" }),
    );

    return {
      cacheControl: new Headers(answer.init?.headers).get("Cache-Control"),
      data: answer.data,
      status: answer.init?.status,
    };
  } catch (thrown) {
    if (thrown instanceof Response) {
      return {
        cacheControl: thrown.headers.get("Cache-Control"),
        location: thrown.headers.get("Location"),
        status: thrown.status,
      };
    }

    throw thrown;
  }
}

describe("the public vote page", () => {
  test("says the vote is not open before the round opens, and is never cached", async () => {
    const fixture = await seedFinalistsFixture();
    await fixture.addFinalist("Alas");

    await expect(load()).resolves.toEqual({
      cacheControl: "no-store",
      page: { state: "not-open" },
    });
  });

  test("says the vote closed once the round closed, even to a code that voted", async () => {
    const round = await seedOpenRoundFixture();
    const {
      tokens: [token],
    } = await round.issueCodes();
    await vote({ academyId: round.alas, codigo: token });
    await closeVotingRound({ eventId: round.eventId });

    await expect(load(`?codigo=${token}`)).resolves.toMatchObject({
      page: { state: "closed" },
    });
  });

  test("shows the finalists with their two pictures, and keeps the code it arrived with", async () => {
    const round = await seedOpenRoundFixture();
    const {
      tokens: [token],
    } = await round.issueCodes();

    const { cacheControl, page } = await load(`?codigo=${token}`);

    expect(cacheControl).toBe("no-store");
    expect(page).toEqual({
      blockReasons: [],
      code: token,
      finalists: [
        expect.objectContaining({ academyId: round.alas, name: "Alas" }),
        expect.objectContaining({ academyId: round.ritmo, name: "Ritmo Sur" }),
      ],
      state: "open",
    });
    expect(
      page.state === "open" &&
        page.finalists.every((finalist) => finalist.pictureUrls.length === 2),
    ).toBe(true);
  });

  test("shows the finalists without a code, and says a code is what votes", async () => {
    await seedOpenRoundFixture();

    await expect(load()).resolves.toMatchObject({
      page: {
        blockReasons: [{ code: "no-code" }],
        code: null,
        state: "open",
      },
    });
  });

  test("tells an unknown code and a voided one apart", async () => {
    const round = await seedOpenRoundFixture();
    const {
      batchId,
      tokens: [token],
    } = await round.issueCodes();
    await voidVoteCodeBatch({ batchId, eventId: round.eventId });

    const unknown = await load("?codigo=AAAAAAAAAAAAAAAAAAAAAA");
    const voided = await load(`?codigo=${token}`);

    expect(unknown.page).toMatchObject({
      blockReasons: [
        {
          code: "unknown-code",
          label:
            "Este código QR no es de esta votación. Revisá que sea el que viene con tu entrada.",
        },
      ],
      code: null,
    });
    expect(voided.page).toMatchObject({
      blockReasons: [
        {
          code: "voided-code",
          label:
            "Este código QR fue anulado por la organización y ya no sirve para votar.",
        },
      ],
      code: null,
    });
  });
});

describe("a vote cast from the page", () => {
  test("counts, and lands on the code's page, which reads it as registered for the academy", async () => {
    const round = await seedOpenRoundFixture();
    const {
      tokens: [token],
    } = await round.issueCodes();

    await expect(
      vote({ academyId: round.ritmo, codigo: token }),
    ).resolves.toEqual({
      cacheControl: "no-store",
      location: `/votar?codigo=${token}`,
      status: 303,
    });
    await expect(load(`?codigo=${token}`)).resolves.toMatchObject({
      page: {
        finalist: { academyId: round.ritmo, name: "Ritmo Sur" },
        state: "registered",
      },
    });
  });

  test("lands a second vote with the same code on the same page, counting one", async () => {
    const round = await seedOpenRoundFixture();
    const {
      tokens: [token],
    } = await round.issueCodes();
    await vote({ academyId: round.ritmo, codigo: token });

    await expect(
      vote({ academyId: round.alas, codigo: token }),
    ).resolves.toMatchObject({
      location: `/votar?codigo=${token}`,
      status: 303,
    });
    await expect(db.$count(votes)).resolves.toBe(1);
  });

  test("is refused with its reason for a voided code, and for a closed round", async () => {
    const round = await seedOpenRoundFixture();
    const { batchId, tokens } = await round.issueCodes(2);
    await voidVoteCodeBatch({ batchId, eventId: round.eventId });

    await expect(
      vote({ academyId: round.alas, codigo: tokens[0] }),
    ).resolves.toEqual({
      cacheControl: "no-store",
      data: {
        message:
          "Este código QR fue anulado por la organización y ya no sirve para votar.",
        status: "error",
      },
      status: 409,
    });

    await closeVotingRound({ eventId: round.eventId });

    await expect(
      vote({ academyId: round.alas, codigo: tokens[1] }),
    ).resolves.toMatchObject({
      data: { message: "La votación ya no está abierta.", status: "error" },
      status: 409,
    });
    await expect(db.$count(votes)).resolves.toBe(0);
  });

  test("is refused without a code", async () => {
    const round = await seedOpenRoundFixture();

    await expect(
      vote({ academyId: round.alas, codigo: "" }),
    ).resolves.toMatchObject({ status: 400 });
    await expect(db.$count(votes)).resolves.toBe(0);
  });
});
