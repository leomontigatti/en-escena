import { describe, expect, test, vi } from "vitest";

import { createVoterSignIn } from "@/lib/grand-final/voter-sign-in.server";
import {
  createFakeProvider,
  redirectUri,
  setup,
  startThenReturn,
} from "@/lib/grand-final/voter-sign-in.test-support";

// None of these reaches the voters table: a sign-in that tried to write a voter
// would throw here, where no database is configured.
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
  });

  test("signs nobody in without the cookie its start set", async () => {
    const { signIn } = setup();
    const { request } = await startThenReturn(signIn);

    await expect(
      signIn.finishSignIn(new Request(request.url), { redirectUri }),
    ).resolves.toMatchObject({ ok: false });
  });

  test("signs nobody in when the provider vouches for no one", async () => {
    const { signIn } = setup({ identity: null });

    await expect(
      signIn.finishSignIn((await startThenReturn(signIn)).request, {
        redirectUri,
      }),
    ).resolves.toMatchObject({ ok: false });
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
    logged.mockRestore();
  });
});
