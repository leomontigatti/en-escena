import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { sql } from "drizzle-orm";
import { createCookie } from "react-router";

import { db } from "@/db";
import { voters } from "@/db/schema";
import { describeServerError } from "@/lib/shared/unexpected-error-log.server";

/**
 * The `voter`'s sign-in for the `Gran final` (ADR-0018): an OAuth exchange of
 * its own, outside the access domain. It never touches a `user`, an account or
 * a Better Auth session; what it leaves behind is a `voter` row keyed by the
 * provider's subject and a short-lived signed cookie that names it.
 *
 * Two calls make the exchange, `startSignIn` and `finishSignIn`; the vote path
 * reads the cookie with `readVoterId`, which never reaches the database, so a
 * request with no valid sign-in is turned away before it costs a query.
 */

/**
 * The provider the exchange runs against: Google today, Meta as a second
 * adapter later. It builds the authorization URL, and turns the code the
 * callback brings back into the identity it vouches for, or null.
 */
export type VoterIdentityProvider = {
  createAuthorizationUrl: (input: {
    codeVerifier: string;
    redirectUri: string;
    state: string;
  }) => Promise<URL>;
  name: "google";
  readIdentity: (input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }) => Promise<VoterIdentity | null>;
};

export type VoterIdentity = { email: string | null; subject: string };

type FinishVoterSignInResult =
  | { ok: true; setCookies: string[]; voterId: string }
  | { ok: false; setCookies: string[] };

/** Long enough for the exchange, short enough that a stale one is useless. */
const exchangeSeconds = 10 * 60;

/** Long enough for an evening's round; past it, the voter signs in again. */
const signedInSeconds = 2 * 60 * 60;

const noStore = { "Cache-Control": "no-store" };

export function createVoterSignIn(deps: {
  now?: () => number;
  provider: VoterIdentityProvider;
  secret: string;
  /** Whether the cookies are `Secure`: everywhere but plain-HTTP dev. */
  secure: boolean;
}) {
  const now = deps.now ?? Date.now;
  const cookieOptions = {
    httpOnly: true,
    // A top-level GET back from the provider must carry the exchange cookie.
    sameSite: "lax" as const,
    secrets: [deriveKey(deps.secret, "voter-cookie")],
    secure: deps.secure,
  };
  const exchangeCookie = createCookie("en_escena_voter_exchange", {
    ...cookieOptions,
    maxAge: exchangeSeconds,
    path: "/votar/google",
  });
  const voterCookie = createCookie("en_escena_voter", {
    ...cookieOptions,
    maxAge: signedInSeconds,
    // The whole site, not `/votar`: the page's own data and action requests
    // go to `/votar.data`, which a `/votar` path does not cover.
    path: "/",
  });
  const emailKey = deriveKey(deps.secret, "voter-email");

  return {
    /** Redirects to the provider, holding the state and PKCE verifier. */
    async startSignIn(input: { redirectUri: string }) {
      const exchange = {
        codeVerifier: randomToken(32),
        expiresAt: now() + exchangeSeconds * 1000,
        state: randomToken(16),
      };
      const url = await deps.provider.createAuthorizationUrl({
        codeVerifier: exchange.codeVerifier,
        redirectUri: input.redirectUri,
        state: exchange.state,
      });
      const headers = new Headers(noStore);
      headers.set("Location", url.href);
      headers.append("Set-Cookie", await exchangeCookie.serialize(exchange));

      return new Response(null, { headers, status: 302 });
    },

    /**
     * Checks the callback against the exchange its start began, asks the
     * provider who signed in, and creates or finds that voter. The exchange
     * cookie is spent either way.
     */
    async finishSignIn(
      request: Request,
      input: { redirectUri: string },
    ): Promise<FinishVoterSignInResult> {
      const spent = [await exchangeCookie.serialize("", { maxAge: 0 })];
      const exchange = readExchange(
        await exchangeCookie.parse(request.headers.get("Cookie")),
        now(),
      );
      const params = new URL(request.url).searchParams;
      const code = params.get("code");

      if (
        !exchange ||
        !code ||
        params.has("error") ||
        !sameText(params.get("state") ?? "", exchange.state)
      ) {
        return { ok: false, setCookies: spent };
      }

      const identity = await deps.provider
        .readIdentity({
          code,
          codeVerifier: exchange.codeVerifier,
          redirectUri: input.redirectUri,
        })
        // A provider that fails to answer signs nobody in, like one that
        // vouches for no one, and leaves a line saying why.
        .catch((thrown: unknown) => {
          console.error("[voter:provider:error]", {
            error: describeServerError(thrown),
            provider: deps.provider.name,
          });

          return null;
        });

      if (!identity?.subject) {
        return { ok: false, setCookies: spent };
      }

      const voterId = await upsertVoter({
        emailHash: identity.email
          ? keyedHash(emailKey, identity.email.trim().toLowerCase())
          : null,
        provider: deps.provider.name,
        subject: identity.subject,
      });
      const signedIn = await voterCookie.serialize({
        expiresAt: now() + signedInSeconds * 1000,
        voterId,
      });

      return { ok: true, setCookies: [...spent, signedIn], voterId };
    },

    /** The signed-in voter, from the cookie alone: no database read. */
    async readVoterId(request: Request): Promise<string | null> {
      const value: unknown = await voterCookie.parse(
        request.headers.get("Cookie"),
      );

      if (
        !isRecord(value) ||
        typeof value.voterId !== "string" ||
        typeof value.expiresAt !== "number" ||
        value.expiresAt <= now()
      ) {
        return null;
      }

      return value.voterId;
    },
  };
}

export type VoterSignIn = ReturnType<typeof createVoterSignIn>;

/**
 * One statement, so two sign-ins of one identity at once still make one
 * voter: the unique index on (provider, subject) settles it.
 */
async function upsertVoter(input: {
  emailHash: string | null;
  provider: VoterIdentityProvider["name"];
  subject: string;
}) {
  const [voter] = await db
    .insert(voters)
    .values(input)
    .onConflictDoUpdate({
      set: { emailHash: sql`excluded.email_hash` },
      target: [voters.provider, voters.subject],
    })
    .returning({ id: voters.id });

  return voter.id;
}

function readExchange(value: unknown, at: number) {
  if (
    !isRecord(value) ||
    typeof value.state !== "string" ||
    typeof value.codeVerifier !== "string" ||
    typeof value.expiresAt !== "number" ||
    value.expiresAt <= at
  ) {
    return null;
  }

  return { codeVerifier: value.codeVerifier, state: value.state };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function randomToken(bytes: number) {
  return randomBytes(bytes).toString("base64url");
}

/**
 * A key of its own per use, from the one secret: the cookie's signature and
 * the email hash share nothing with Better Auth's signatures.
 */
function deriveKey(secret: string, purpose: string) {
  return keyedHash(secret, `en-escena:${purpose}`);
}

function keyedHash(key: string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function sameText(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);

  return a.length === b.length && timingSafeEqual(a, b);
}
