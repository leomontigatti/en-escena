import { google } from "better-auth/social-providers";

import {
  createVoterSignIn,
  type VoterIdentityProvider,
  type VoterSignIn,
} from "@/lib/grand-final/voter-sign-in.server";

/**
 * The providers a `voter` signs in with, and the one a deployment gets.
 * Google is the only real one; Meta is a second adapter here when its review
 * clears (#1503).
 */

/**
 * Google, through Better Auth's provider adapter used on its own: it builds
 * the URL and exchanges the code, and nothing else. No Better Auth instance is
 * involved, so no `user`, account or session is written (ADR-0018).
 */
function createGoogleVoterIdentityProvider(credentials: {
  clientId: string;
  clientSecret: string;
}): VoterIdentityProvider {
  const adapter = google({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    disableDefaultScope: true,
    // A shared phone picks its account rather than reusing the last one.
    prompt: "select_account",
    scope: ["openid", "email"],
  });

  return {
    name: "google",
    createAuthorizationUrl: (input) =>
      adapter.createAuthorizationURL({
        codeVerifier: input.codeVerifier,
        redirectURI: input.redirectUri,
        state: input.state,
      }),
    readIdentity: async (input) => {
      const tokens = await adapter.validateAuthorizationCode({
        code: input.code,
        codeVerifier: input.codeVerifier,
        redirectURI: input.redirectUri,
      });
      // The ID token comes straight from Google's token endpoint over TLS,
      // which OpenID Connect Core §3.1.3.7 accepts in place of checking its
      // signature; the adapter reads its claims.
      const info = await adapter.getUserInfo(tokens);

      return info?.user.id
        ? { email: info.user.email ?? null, subject: String(info.user.id) }
        : null;
    },
  };
}

/**
 * A stand-in for local development and tests, where there are no Google
 * credentials: it goes straight back to the callback and vouches for one
 * local voter, so a second sign-in finds the same one.
 */
export function createLocalVoterIdentityProvider(): VoterIdentityProvider {
  return {
    name: "google",
    createAuthorizationUrl: async (input) => {
      const url = new URL(input.redirectUri);
      url.searchParams.set("code", "votante-local");
      url.searchParams.set("state", input.state);

      return url;
    },
    readIdentity: async (input) => ({
      email: null,
      subject: `local:${input.code}`,
    }),
  };
}

/**
 * Google when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set; the local
 * stand-in outside production; and no sign-in at all in a production build
 * without them, where the vote page offers the QR code alone.
 */
export function createDefaultVoterSignIn(
  env: NodeJS.ProcessEnv = process.env,
): VoterSignIn | null {
  const isProduction = env.NODE_ENV === "production";
  const provider = readVoterIdentityProvider(env, isProduction);

  if (!provider) {
    return null;
  }

  return createVoterSignIn({
    provider,
    secret: readVoterCookieSecret(env, isProduction),
    secure: isProduction,
  });
}

function readVoterIdentityProvider(
  env: NodeJS.ProcessEnv,
  isProduction: boolean,
): VoterIdentityProvider | null {
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    return createGoogleVoterIdentityProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    });
  }

  return isProduction ? null : createLocalVoterIdentityProvider();
}

/**
 * The voter cookie is signed with a key derived from `BETTER_AUTH_SECRET`,
 * already required in production, and fails closed there without it, as the
 * flash cookie does. Dev and tests fall back to a fixed value.
 */
function readVoterCookieSecret(env: NodeJS.ProcessEnv, isProduction: boolean) {
  if (env.BETTER_AUTH_SECRET) {
    return env.BETTER_AUTH_SECRET;
  }

  if (isProduction) {
    throw new Error(
      "BETTER_AUTH_SECRET is required in production to sign the voter cookie.",
    );
  }

  return "development-voter-cookie-secret-development-voter-cookie-secret";
}
