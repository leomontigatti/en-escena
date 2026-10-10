import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { voters, votes } from "@/db/schema";
import { voidVoteCodeBatch } from "@/lib/grand-final/vote-codes.server";
import { createLocalVoterIdentityProvider } from "@/lib/grand-final/voter-identity-providers.server";
import {
  createVoterSignIn,
  type VoterSignIn,
} from "@/lib/grand-final/voter-sign-in.server";
import {
  openTieBreakRound,
  readActiveEventVotingRound,
  readCurrentVotingRound,
} from "@/lib/grand-final/voting-round.server";
import { readCodeStanding } from "@/lib/grand-final/vote.server";
import {
  hideGrandFinalResult,
  publishGrandFinalResult,
} from "@/lib/grand-final/result.server";
import {
  closeCurrentVotingRound,
  seedFinalistsFixture,
  seedOpenRoundFixture,
  seedResultFixture,
  seedTiedRoundFixture,
} from "@/lib/grand-final/voting.test-support";
import { createFilesystemGrandFinalBannerStorage } from "@/lib/storage/grand-final-banners.server";

import { handleVoteAction, loadVotePage } from "./server";
import {
  handleVoterSignInFinish,
  handleVoterSignInStart,
} from "./sign-in.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

// Signing a picture's URL reads nothing from the volume.
const storage = createFilesystemGrandFinalBannerStorage({
  baseDir: "/volumen-de-prueba",
  now: () => 1_000_000,
  secret: "volume-signing-secret",
});

const signIn = createVoterSignIn({
  provider: createLocalVoterIdentityProvider(),
  secret: "secreto-de-prueba",
  secure: false,
});

/** A visitor's browser: the cookies the server set so far. */
type Visitor = { cookie: string };

const newVisitor = (): Visitor => ({ cookie: "" });

function keepCookies(visitor: Visitor, response: Response) {
  const jar = new Map(
    visitor.cookie
      .split("; ")
      .filter(Boolean)
      .map((pair) => [pair.split("=")[0], pair] as const),
  );

  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0];
    jar.set(pair.split("=")[0], pair);
  }

  visitor.cookie = [...jar.values()].join("; ");
}

function request(path: string, visitor?: Visitor, init: RequestInit = {}) {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: visitor?.cookie ? { Cookie: visitor.cookie } : {},
  });
}

async function answerOf(run: () => Promise<Response>) {
  try {
    return await run();
  } catch (thrown) {
    if (thrown instanceof Response) {
      return thrown;
    }

    throw thrown;
  }
}

/** Signs the visitor in with the local stand-in for Google, start to finish. */
async function signInWithGoogle(visitor: Visitor, voterSignIn = signIn) {
  const started = await handleVoterSignInStart(
    request("/votar/google", visitor, { method: "POST" }),
    voterSignIn,
  );
  keepCookies(visitor, started);
  const callback = new URL(started.headers.get("Location") ?? "");
  const finished = await answerOf(() =>
    handleVoterSignInFinish(
      request(`${callback.pathname}${callback.search}`, visitor),
      voterSignIn,
    ),
  );
  keepCookies(visitor, finished);

  return { finished, started };
}

async function load(
  query = "",
  visitor?: Visitor,
  voterSignIn: VoterSignIn | null = signIn,
) {
  const answer = await loadVotePage(
    request(`/votar${query}`, visitor),
    storage,
    voterSignIn,
  );

  return {
    cacheControl: new Headers(answer.init?.headers).get("Cache-Control"),
    page: answer.data,
  };
}

/**
 * Sends the vote form. It names the round the visitor's page showed: the
 * current one, unless the test says otherwise.
 */
async function vote(
  input: { academyId: string; codigo: string; roundId?: string },
  visitor?: Visitor,
) {
  const body = new FormData();
  body.set("academyId", input.academyId);
  body.set("codigo", input.codigo);
  body.set(
    "roundId",
    input.roundId ?? (await readActiveEventVotingRound())?.id ?? "",
  );

  try {
    const answer = await handleVoteAction(
      request("/votar", visitor, { body, method: "POST" }),
      signIn,
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
    await closeCurrentVotingRound(round.eventId);

    await expect(load(`?codigo=${token}`)).resolves.toMatchObject({
      page: { state: "closed" },
    });
  });

  test("shows the published ranking with each finalist's share and no totals, only while it is published", async () => {
    const fixture = await seedResultFixture();
    const [token] = await fixture.issueCodes(1);
    await fixture.vote(fixture.alas, { tokens: [token] });
    await fixture.vote(fixture.ritmo, { voters: 3 });
    await closeCurrentVotingRound(fixture.eventId);

    await expect(load()).resolves.toMatchObject({ page: { state: "closed" } });

    await publishGrandFinalResult({ eventId: fixture.eventId });

    await expect(load(`?codigo=${token}`)).resolves.toEqual({
      cacheControl: "no-store",
      page: {
        ranking: [
          {
            academyId: fixture.alas,
            city: null,
            name: "Alas",
            percentage: 90.9,
            position: 1,
            winner: true,
          },
          {
            academyId: fixture.ritmo,
            city: null,
            name: "Ritmo Sur",
            percentage: 9.1,
            position: 2,
            winner: false,
          },
          {
            academyId: fixture.sol,
            city: null,
            name: "Sol",
            percentage: 0,
            position: 3,
            winner: false,
          },
        ],
        roundNumber: 1,
        state: "published",
        tieBrokenByCodeVotes: false,
      },
    });

    await hideGrandFinalResult({ eventId: fixture.eventId });

    await expect(load()).resolves.toMatchObject({ page: { state: "closed" } });
  });

  test("shows the finalists with their two pictures, and keeps the code it arrived with", async () => {
    const round = await seedOpenRoundFixture();
    const {
      tokens: [token],
    } = await round.issueCodes();

    const { cacheControl, page } = await load(`?codigo=${token}`);

    expect(cacheControl).toBe("no-store");
    expect(page).toEqual({
      code: token,
      finalists: [
        expect.objectContaining({ academyId: round.alas, name: "Alas" }),
        expect.objectContaining({ academyId: round.ritmo, name: "Ritmo Sur" }),
      ],
      roundId: round.roundId,
      state: "open",
    });
    expect(
      page.state === "open" &&
        page.finalists.every((finalist) => finalist.pictureUrls.length === 2),
    ).toBe(true);
  });

  test("asks a visitor with no code and no sign-in to sign in with Google, showing no finalist", async () => {
    await seedOpenRoundFixture();

    await expect(load()).resolves.toEqual({
      cacheControl: "no-store",
      page: { google: true, state: "sign-in" },
    });
  });

  test("asks for the ticket's code where Google is not configured", async () => {
    await seedOpenRoundFixture();

    await expect(load("", undefined, null)).resolves.toMatchObject({
      page: { google: false, state: "sign-in" },
    });
  });

  test("tells an unknown code and a voided one apart, showing no finalist", async () => {
    const round = await seedOpenRoundFixture();
    const {
      batchId,
      tokens: [token],
    } = await round.issueCodes();
    await voidVoteCodeBatch({ batchId, eventId: round.eventId });

    const unknown = await load("?codigo=AAAAAAAAAAAAAAAAAAAAAA");
    const voided = await load(`?codigo=${token}`);

    expect(unknown.page).toEqual({
      reason: "unknown-code",
      state: "code-refused",
    });
    expect(voided.page).toEqual({
      reason: "voided-code",
      state: "code-refused",
    });
  });

  test("asks for a sign-in again when the voter's cookie outlived its voter", async () => {
    await seedOpenRoundFixture();
    const visitor = newVisitor();
    await signInWithGoogle(visitor);
    await db.delete(voters);

    await expect(load("", visitor)).resolves.toMatchObject({
      page: { google: true, state: "sign-in" },
    });
  });

  test("tells a signed-in voter whose address names a voided code that the code cannot vote", async () => {
    const round = await seedOpenRoundFixture();
    const {
      batchId,
      tokens: [token],
    } = await round.issueCodes();
    await voidVoteCodeBatch({ batchId, eventId: round.eventId });
    const visitor = newVisitor();
    await signInWithGoogle(visitor);

    await expect(load(`?codigo=${token}`, visitor)).resolves.toMatchObject({
      page: { reason: "voided-code", state: "code-refused" },
    });
  });
});

describe("a vote with Google", () => {
  test("signs in and returns to the page, which then lets the voter vote, never cached", async () => {
    await seedOpenRoundFixture();
    const visitor = newVisitor();

    const { finished, started } = await signInWithGoogle(visitor);

    expect(started.headers.get("Cache-Control")).toBe("no-store");
    expect(finished.status).toBe(302);
    expect(finished.headers.get("Location")).toBe("/votar");
    expect(finished.headers.get("Cache-Control")).toBe("no-store");
    await expect(load("", visitor)).resolves.toMatchObject({
      cacheControl: "no-store",
      page: { code: null, state: "open" },
    });
  });

  test("counts one point, and lands on the page, which reads it as registered", async () => {
    const round = await seedOpenRoundFixture();
    const visitor = newVisitor();
    await signInWithGoogle(visitor);

    await expect(
      vote({ academyId: round.alas, codigo: "" }, visitor),
    ).resolves.toEqual({
      cacheControl: "no-store",
      location: "/votar",
      status: 303,
    });
    await expect(
      db.select({ points: votes.points }).from(votes),
    ).resolves.toEqual([{ points: 1 }]);
    await expect(load("", visitor)).resolves.toMatchObject({
      page: { finalist: { academyId: round.alas }, state: "registered" },
    });
  });

  test("lands a second vote of the same voter, signed in again, on the registered page, counting one", async () => {
    const round = await seedOpenRoundFixture();
    const visitor = newVisitor();
    await signInWithGoogle(visitor);
    await vote({ academyId: round.alas, codigo: "" }, visitor);

    const again = newVisitor();
    await signInWithGoogle(again);

    await expect(load("", again)).resolves.toMatchObject({
      page: { finalist: { academyId: round.alas }, state: "registered" },
    });
    await expect(
      vote({ academyId: round.ritmo, codigo: "" }, again),
    ).resolves.toMatchObject({ location: "/votar", status: 303 });
    await expect(db.$count(votes)).resolves.toBe(1);
    await expect(db.$count(voters)).resolves.toBe(1);
  });

  test("counts a ticket's code and the same person's Google sign-in both", async () => {
    const round = await seedOpenRoundFixture();
    const {
      tokens: [token],
    } = await round.issueCodes();
    const visitor = newVisitor();

    await vote({ academyId: round.alas, codigo: token }, visitor);
    await expect(load(`?codigo=${token}`, visitor)).resolves.toMatchObject({
      page: { state: "registered" },
    });
    await signInWithGoogle(visitor);
    await vote({ academyId: round.alas, codigo: "" }, visitor);

    await expect(
      db.select({ points: votes.points }).from(votes),
    ).resolves.toEqual(expect.arrayContaining([{ points: 30 }, { points: 1 }]));
  });

  test("votes with the code in the address, never the voter, when the form names none", async () => {
    const round = await seedOpenRoundFixture();
    const {
      batchId,
      tokens: [token],
    } = await round.issueCodes();
    await voidVoteCodeBatch({ batchId, eventId: round.eventId });
    const visitor = newVisitor();
    await signInWithGoogle(visitor);
    const body = new FormData();
    body.set("academyId", round.alas);
    body.set("codigo", "");
    body.set("roundId", round.roundId);

    const answer: unknown = await handleVoteAction(
      request(`/votar?codigo=${token}`, visitor, { body, method: "POST" }),
      signIn,
    ).catch((thrown: unknown) => thrown);

    expect(answer).toBeInstanceOf(Response);
    expect((answer as Response).headers.get("Location")).toBe(
      `/votar?codigo=${token}`,
    );
    await expect(db.$count(votes)).resolves.toBe(0);
  });

  // The cookie is read before the database: with no round at all, a request
  // with no valid sign-in is refused as such, not as a closed round.
  test("turns away a vote with no code and no valid sign-in before reading the round", async () => {
    const forged = {
      cookie: "en_escena_voter=eyJ2b3RlcklkIjoieCJ9.firma-falsa",
    };

    await expect(
      vote({ academyId: "cualquiera", codigo: "" }, forged),
    ).resolves.toEqual({
      cacheControl: "no-store",
      location: "/votar",
      status: 303,
    });
  });

  test("returns to the page with a toast when the sign-in failed, signing nobody in", async () => {
    await seedOpenRoundFixture();
    const visitor = newVisitor();

    const finished = await answerOf(() =>
      handleVoterSignInFinish(
        request("/votar/google/retorno?error=access_denied", visitor),
        signIn,
      ),
    );

    expect(finished.headers.get("Location")).toBe("/votar");
    expect(finished.headers.get("Cache-Control")).toBe("no-store");
    expect(finished.headers.getSetCookie().join()).toContain("ee-flash=");
    await expect(db.$count(voters)).resolves.toBe(0);
  });

  test("has no sign-in to start where Google is not configured", async () => {
    const answer = await answerOf(() =>
      handleVoterSignInStart(
        request("/votar/google", undefined, { method: "POST" }),
        null,
      ),
    );

    expect(answer.status).toBe(404);
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

  test("refuses a form chosen in round 1 and sent once the Desempate opened, casting nothing in round 2", async () => {
    const fixture = await seedTiedRoundFixture();
    const roundOne = await readCurrentVotingRound(fixture.eventId);
    await openTieBreakRound({ eventId: fixture.eventId });
    const roundTwo = await readCurrentVotingRound(fixture.eventId);

    await expect(
      vote({
        academyId: fixture.alas,
        codigo: fixture.tokens[1],
        roundId: roundOne?.id ?? "",
      }),
    ).resolves.toMatchObject({
      data: {
        message:
          "Se abrió el desempate entre las academias empatadas. Recargá la página para votar de nuevo.",
        status: "error",
      },
      status: 409,
    });
    await expect(
      readCodeStanding({
        roundId: roundTwo?.id ?? "",
        token: fixture.tokens[1],
      }),
    ).resolves.toEqual({ status: "available" });
  });

  test("goes back to the code's page for a voided code, and is refused for a closed round", async () => {
    const round = await seedOpenRoundFixture();
    const { batchId, tokens } = await round.issueCodes(2);
    await voidVoteCodeBatch({ batchId, eventId: round.eventId });

    await expect(
      vote({ academyId: round.alas, codigo: tokens[0] }),
    ).resolves.toEqual({
      cacheControl: "no-store",
      location: `/votar?codigo=${tokens[0]}`,
      status: 303,
    });
    await expect(load(`?codigo=${tokens[0]}`)).resolves.toMatchObject({
      page: { reason: "voided-code", state: "code-refused" },
    });

    await closeCurrentVotingRound(round.eventId);

    await expect(
      vote({ academyId: round.alas, codigo: tokens[1] }),
    ).resolves.toMatchObject({
      data: { message: "La votación ya no está abierta.", status: "error" },
      status: 409,
    });
    await expect(db.$count(votes)).resolves.toBe(0);
  });

  test("goes back to the page, which asks for a sign-in, without a code", async () => {
    const round = await seedOpenRoundFixture();

    await expect(
      vote({ academyId: round.alas, codigo: "" }),
    ).resolves.toMatchObject({ location: "/votar", status: 303 });
    await expect(db.$count(votes)).resolves.toBe(0);
  });
});
