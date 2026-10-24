import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { account, user, voters } from "@/db/schema";
import { createDefaultVoterSignIn } from "@/lib/grand-final/voter-identity-providers.server";
import { createVoterSignIn } from "@/lib/grand-final/voter-sign-in.server";
import {
  cookieHeaderFrom,
  createFakeProvider,
  redirectUri,
  setup,
  startThenReturn,
} from "@/lib/grand-final/voter-sign-in.test-support";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("finishing a voter's sign-in", () => {
  test("creates the voter, with the provider's subject and a hashed email, and signs them in", async () => {
    const { exchanges, signIn } = setup();
    const { location, request } = await startThenReturn(signIn);

    const finished = await signIn.finishSignIn(request, { redirectUri });

    expect(finished.ok).toBe(true);
    expect(exchanges).toEqual([
      {
        code: "codigo-del-proveedor",
        codeVerifier: location.searchParams.get("verifier"),
      },
    ]);
    const [voter] = await db.select().from(voters);
    expect(voter).toMatchObject({
      provider: "google",
      subject: "google-sujeto-1",
    });
    expect(voter.emailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(voter.emailHash).not.toContain("example");

    // The page's data and action requests go to `/votar.data`.
    expect(finished.setCookies).toContainEqual(
      expect.stringMatching(/^en_escena_voter=.*; Path=\/;/),
    );
    const signedIn = new Request("http://localhost/votar", {
      headers: { Cookie: cookieHeaderFrom(finished.setCookies) },
    });
    await expect(signIn.readVoterId(signedIn)).resolves.toBe(voter.id);
  });

  test("finds the same voter on a second sign-in, with the email in any case", async () => {
    const { signIn } = setup();
    const again = setup({
      identity: { email: "votante@example.com", subject: "google-sujeto-1" },
    }).signIn;

    const first = await signIn.finishSignIn(
      (await startThenReturn(signIn)).request,
      { redirectUri },
    );
    const second = await again.finishSignIn(
      (await startThenReturn(again)).request,
      { redirectUri },
    );

    expect(first.ok && second.ok && first.voterId === second.voterId).toBe(
      true,
    );
    await expect(db.$count(voters)).resolves.toBe(1);
  });

  test("keeps a voter whose provider shares no email", async () => {
    const { signIn } = setup({
      identity: { email: null, subject: "sin-correo" },
    });

    await signIn.finishSignIn((await startThenReturn(signIn)).request, {
      redirectUri,
    });

    await expect(db.select().from(voters)).resolves.toEqual([
      expect.objectContaining({ emailHash: null, subject: "sin-correo" }),
    ]);
  });

  // ADR-0018: a voter is not a user, and the sign-in reaches nothing of the
  // access domain.
  test("writes nothing to the users or their accounts", async () => {
    const { signIn } = setup();
    const users = await db.$count(user);
    const accounts = await db.$count(account);

    await signIn.finishSignIn((await startThenReturn(signIn)).request, {
      redirectUri,
    });

    await expect(db.$count(user)).resolves.toBe(users);
    await expect(db.$count(account)).resolves.toBe(accounts);
  });
});

// The real Google adapter, with only Google's token endpoint answered here: a
// dependency upgrade that changes what the adapter reads off the ID token
// fails this test instead of every vote.
describe("finishing a sign-in with Google", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function unsignedIdToken(claims: Record<string, unknown>) {
    const part = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");

    return `${part({ alg: "RS256", typ: "JWT" })}.${part(claims)}.firma`;
  }

  test("creates the voter with the subject of Google's ID token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          access_token: "token-de-acceso",
          expires_in: 3599,
          id_token: unsignedIdToken({
            aud: "cliente.apps.googleusercontent.com",
            email: "votante@example.com",
            iss: "https://accounts.google.com",
            sub: "109876543210",
          }),
          token_type: "Bearer",
        }),
      ),
    );
    const signIn = createDefaultVoterSignIn({
      BETTER_AUTH_SECRET: "secreto",
      GOOGLE_CLIENT_ID: "cliente.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "secreto-de-google",
      NODE_ENV: "production",
    });
    if (!signIn) throw new Error("Google sign-in is configured");
    const started = await signIn.startSignIn({ redirectUri });
    const state = new URL(
      started.headers.get("Location") ?? "",
    ).searchParams.get("state");
    const request = new Request(
      `${redirectUri}?code=codigo-de-google&state=${state}`,
      {
        headers: { Cookie: cookieHeaderFrom(started.headers.getSetCookie()) },
      },
    );

    const finished = await signIn.finishSignIn(request, { redirectUri });

    expect(finished.ok).toBe(true);
    await expect(db.select().from(voters)).resolves.toEqual([
      expect.objectContaining({ provider: "google", subject: "109876543210" }),
    ]);
  });
});

describe("reading the signed-in voter", () => {
  async function signedInCookie(signIn: ReturnType<typeof setup>["signIn"]) {
    const finished = await signIn.finishSignIn(
      (await startThenReturn(signIn)).request,
      { redirectUri },
    );

    return cookieHeaderFrom(finished.setCookies);
  }

  test("reads nobody from a cookie another secret signed", async () => {
    const { signIn } = setup();
    const forger = createVoterSignIn({
      provider: createFakeProvider().provider,
      secret: "otro-secreto",
      secure: false,
    });
    const cookie = await signedInCookie(forger);

    await expect(
      signIn.readVoterId(
        new Request("http://localhost/votar", { headers: { Cookie: cookie } }),
      ),
    ).resolves.toBeNull();
  });

  test("reads nobody once the sign-in expired", async () => {
    let now = Date.UTC(2026, 9, 18, 21);
    const { signIn } = setup({ now: () => now });
    const cookie = await signedInCookie(signIn);
    const request = () =>
      new Request("http://localhost/votar", { headers: { Cookie: cookie } });

    await expect(signIn.readVoterId(request())).resolves.not.toBeNull();

    now += 3 * 60 * 60 * 1000;

    await expect(signIn.readVoterId(request())).resolves.toBeNull();
  });
});
