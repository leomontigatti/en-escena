import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { account, user, voters } from "@/db/schema";
import {
  createVoterSignIn,
  type VoterIdentityProvider,
} from "@/lib/grand-final/voter-sign-in.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

const redirectUri = "http://localhost/votar/google/retorno";

/**
 * A provider that vouches for whoever the test names, and remembers the PKCE
 * verifier the finish handed it, so the test can check it is the start's.
 */
function createFakeProvider(
  identity: { email: string | null; subject: string } | null = {
    email: "Votante@Example.com",
    subject: "google-sujeto-1",
  },
) {
  const exchanges: { code: string; codeVerifier: string }[] = [];
  const provider: VoterIdentityProvider = {
    name: "google",
    createAuthorizationUrl: async (input) => {
      const url = new URL("https://proveedor.test/autorizar");
      url.searchParams.set("state", input.state);
      url.searchParams.set("redirect_uri", input.redirectUri);
      url.searchParams.set("verifier", input.codeVerifier);

      return url;
    },
    readIdentity: async (input) => {
      exchanges.push({ code: input.code, codeVerifier: input.codeVerifier });

      return identity;
    },
  };

  return { exchanges, provider };
}

function setup(
  options: {
    identity?: { email: string | null; subject: string } | null;
    now?: () => number;
  } = {},
) {
  const fake = createFakeProvider(options.identity);
  const signIn = createVoterSignIn({
    now: options.now,
    provider: fake.provider,
    secret: "secreto-de-prueba",
    secure: false,
  });

  return { ...fake, signIn };
}

/** The `Cookie` header a browser sends back after these `Set-Cookie`s. */
function cookieHeaderFrom(setCookies: string[]) {
  return setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

/** Starts the sign-in, and answers the provider's callback request. */
async function startThenReturn(
  signIn: ReturnType<typeof setup>["signIn"],
  callback: (state: string) => Record<string, string> = (state) => ({
    code: "codigo-del-proveedor",
    state,
  }),
) {
  const started = await signIn.startSignIn({ redirectUri });
  const location = new URL(started.headers.get("Location") ?? "");
  const query = new URLSearchParams(
    callback(location.searchParams.get("state") ?? ""),
  );

  return {
    location,
    request: new Request(`${redirectUri}?${query}`, {
      headers: { Cookie: cookieHeaderFrom(started.headers.getSetCookie()) },
    }),
    started,
  };
}

describe("starting a voter's sign-in", () => {
  test("redirects to the provider with a fresh state, never cached", async () => {
    const { signIn } = setup();

    const first = await signIn.startSignIn({ redirectUri });
    const second = await signIn.startSignIn({ redirectUri });
    const location = new URL(first.headers.get("Location") ?? "");

    expect(first.status).toBe(302);
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect(location.origin + location.pathname).toBe(
      "https://proveedor.test/autorizar",
    );
    expect(location.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(location.searchParams.get("state")).not.toBe(
      new URL(second.headers.get("Location") ?? "").searchParams.get("state"),
    );
    expect(first.headers.getSetCookie()).toEqual([
      expect.stringMatching(/HttpOnly/),
    ]);
  });
});

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

  test.each([
    {
      label: "a state that is not the one it started with",
      callback: () => ({ code: "codigo", state: "otro-estado" }),
    },
    {
      label: "a callback with no code",
      callback: (state: string) => ({ state }),
    },
    {
      label: "a provider error, such as a cancelled consent",
      callback: (state: string) => ({ error: "access_denied", state }),
    },
  ])("signs nobody in on $label", async ({ callback }) => {
    const { exchanges, signIn } = setup();
    const { request } = await startThenReturn(signIn, callback);

    await expect(
      signIn.finishSignIn(request, { redirectUri }),
    ).resolves.toMatchObject({ ok: false });
    expect(exchanges).toEqual([]);
    await expect(db.$count(voters)).resolves.toBe(0);
  });

  test("signs nobody in without the cookie its start set", async () => {
    const { signIn } = setup();
    const { request } = await startThenReturn(signIn);

    await expect(
      signIn.finishSignIn(new Request(request.url), { redirectUri }),
    ).resolves.toMatchObject({ ok: false });
    await expect(db.$count(voters)).resolves.toBe(0);
  });

  test("signs nobody in when the provider vouches for no one", async () => {
    const { signIn } = setup({ identity: null });

    await expect(
      signIn.finishSignIn((await startThenReturn(signIn)).request, {
        redirectUri,
      }),
    ).resolves.toMatchObject({ ok: false });
    await expect(db.$count(voters)).resolves.toBe(0);
  });
});

describe("a provider that fails to answer", () => {
  test("signs nobody in, and logs why", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { provider } = createFakeProvider();
    const signIn = createVoterSignIn({
      provider: {
        ...provider,
        readIdentity: async () => {
          throw new Error("invalid_grant");
        },
      },
      secret: "secreto-de-prueba",
      secure: false,
    });

    await expect(
      signIn.finishSignIn((await startThenReturn(signIn)).request, {
        redirectUri,
      }),
    ).resolves.toMatchObject({ ok: false });
    expect(logged).toHaveBeenCalledWith(
      "[voter:provider:error]",
      expect.objectContaining({ provider: "google" }),
    );
    await expect(db.$count(voters)).resolves.toBe(0);
    logged.mockRestore();
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
