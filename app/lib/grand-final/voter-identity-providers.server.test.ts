import { describe, expect, test } from "vitest";

import { createDefaultVoterSignIn } from "@/lib/grand-final/voter-identity-providers.server";

const redirectUri = "https://sistema.enescena.com.ar/votar/google/retorno";

async function startLocation(env: NodeJS.ProcessEnv) {
  const signIn = createDefaultVoterSignIn(env);
  const started = await signIn?.startSignIn({ redirectUri });

  return started ? new URL(started.headers.get("Location") ?? "") : null;
}

describe("the voter sign-in a deployment gets", () => {
  test("sends to Google with the client, PKCE and only the identity scopes", async () => {
    const location = await startLocation({
      BETTER_AUTH_SECRET: "secreto",
      GOOGLE_CLIENT_ID: "cliente.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "secreto-de-google",
      NODE_ENV: "production",
    });

    expect(location?.origin).toBe("https://accounts.google.com");
    expect(Object.fromEntries(location?.searchParams ?? [])).toMatchObject({
      client_id: "cliente.apps.googleusercontent.com",
      code_challenge_method: "S256",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email",
    });
  });

  test("offers no sign-in in production until Google is configured", () => {
    expect(
      createDefaultVoterSignIn({
        BETTER_AUTH_SECRET: "secreto",
        NODE_ENV: "production",
      }),
    ).toBeNull();
  });

  // Local development and tests run without Google: a stand-in vouches for
  // one local voter and returns straight to the callback.
  test("goes straight back to the callback outside production", async () => {
    const location = await startLocation({ NODE_ENV: "development" });

    expect(location?.origin + (location?.pathname ?? "")).toBe(redirectUri);
    expect(location?.searchParams.get("code")).toBeTruthy();
  });

  test("refuses to sign cookies in production without a secret", () => {
    expect(() =>
      createDefaultVoterSignIn({
        GOOGLE_CLIENT_ID: "cliente",
        GOOGLE_CLIENT_SECRET: "secreto-de-google",
        NODE_ENV: "production",
      }),
    ).toThrow();
  });
});
