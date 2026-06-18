import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from "node:crypto";

import { and, eq, gt } from "drizzle-orm";
import { parse, serialize } from "cookie";

import { db } from "@/db";
import { accessCredential, accessSession, user } from "@/db/schema";

export const ACCESS_SESSION_EXPIRES_IN_SECONDS = 8 * 60 * 60;
export const ACCESS_SESSION_UPDATE_AGE_SECONDS = 30 * 60;
export const TEST_ACCESS_SESSION_COOKIE_NAME = "sb-access-token";

const ACCESS_SESSION_TTL_MS = ACCESS_SESSION_EXPIRES_IN_SECONDS * 1000;
const ACCESS_SESSION_REFRESH_WINDOW_MS =
  ACCESS_SESSION_TTL_MS - ACCESS_SESSION_UPDATE_AGE_SECONDS * 1000;
const SCRYPT_KEY_LENGTH = 64;

export async function createLocalAccessUser(input: {
  email: string;
  headers?: Headers;
  name: string;
  password: string;
}) {
  const savedUser = await db
    .insert(user)
    .values({
      email: input.email,
      emailVerified: false,
      name: input.name,
    })
    .returning({ id: user.id })
    .then((rows) => rows[0]);

  if (!savedUser?.id) {
    throw new Error("Expected local access user to be created.");
  }

  await upsertLocalAccessPassword({
    password: input.password,
    userId: savedUser.id,
  });

  const sessionRecord = await createLocalAccessSession({
    headers: input.headers,
    userId: savedUser.id,
  });

  return {
    headers: sessionRecord.headers,
    response: {
      user: {
        email: input.email,
        id: savedUser.id,
      },
    },
    user: {
      email: input.email,
      id: savedUser.id,
    },
  };
}

export async function signInLocalAccessUser(input: {
  email: string;
  headers?: Headers;
  password: string;
}) {
  const savedUser = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, input.email),
  });

  if (!savedUser?.id) {
    throw new Error("Invalid email or password.");
  }

  const passwordMatches = await verifyLocalAccessPassword({
    email: input.email,
    password: input.password,
  });

  if (!passwordMatches) {
    throw new Error("Invalid email or password.");
  }

  const sessionRecord = await createLocalAccessSession({
    headers: input.headers,
    userId: savedUser.id,
  });

  return {
    headers: sessionRecord.headers,
    response: {
      user: {
        email: input.email,
        id: savedUser.id,
      },
    },
    user: {
      email: input.email,
      id: savedUser.id,
    },
  };
}

export async function readLocalAccessSession(headers: Headers) {
  const sessionToken =
    extractLocalAccessSessionTokenFromRequestHeaders(headers);

  if (!sessionToken) {
    return null;
  }

  const savedSession = await db.query.accessSession.findFirst({
    columns: {
      createdAt: true,
      expiresAt: true,
      id: true,
      token: true,
      userId: true,
    },
    where: and(
      eq(accessSession.token, sessionToken),
      gt(accessSession.expiresAt, new Date()),
    ),
  });

  if (!savedSession) {
    return null;
  }

  if (shouldRefreshLocalAccessSession(savedSession.expiresAt)) {
    const refreshedExpiresAt = new Date(Date.now() + ACCESS_SESSION_TTL_MS);

    await db
      .update(accessSession)
      .set({
        expiresAt: refreshedExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(accessSession.id, savedSession.id));

    savedSession.expiresAt = refreshedExpiresAt;
  }

  const savedUser = await db.query.user.findFirst({
    columns: {
      email: true,
      id: true,
    },
    where: eq(user.id, savedSession.userId),
  });

  if (!savedUser?.email) {
    return null;
  }

  return {
    session: {
      expiresAt: savedSession.expiresAt,
      id: savedSession.id,
      issuedAt: savedSession.createdAt,
      token: savedSession.token,
    },
    user: savedUser,
  };
}

export async function upsertLocalAccessPassword(input: {
  password: string;
  userId: string;
}) {
  const passwordHash = createLocalAccessPasswordHash(input.password);
  const existingCredential = await db.query.accessCredential.findFirst({
    columns: { id: true },
    where: eq(accessCredential.userId, input.userId),
  });

  if (existingCredential?.id) {
    await db
      .update(accessCredential)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(accessCredential.id, existingCredential.id));
    return;
  }

  await db.insert(accessCredential).values({
    passwordHash,
    userId: input.userId,
  });
}

export async function verifyLocalAccessPassword(input: {
  email: string;
  password: string;
}) {
  const savedUser = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, input.email),
  });

  if (!savedUser?.id) {
    return false;
  }

  const savedCredential = await db.query.accessCredential.findFirst({
    columns: { passwordHash: true },
    where: eq(accessCredential.userId, savedUser.id),
  });

  if (!savedCredential?.passwordHash) {
    return false;
  }

  return verifyLocalAccessPasswordHash({
    hash: savedCredential.passwordHash,
    password: input.password,
  });
}

export async function createLocalAccessSession(input: {
  headers?: Headers;
  userId: string;
}) {
  const savedSession = await db
    .insert(accessSession)
    .values({
      expiresAt: new Date(Date.now() + ACCESS_SESSION_TTL_MS),
      userId: input.userId,
      token: crypto.randomUUID(),
    })
    .returning({
      id: accessSession.id,
      token: accessSession.token,
    })
    .then((rows) => rows[0]);

  if (!savedSession) {
    throw new Error("Expected local access session to be created.");
  }

  return {
    headers: buildLocalAccessSessionHeaders(savedSession.token),
    session: savedSession,
  };
}

export function buildLocalAccessSessionHeaders(sessionToken: string | null) {
  const headers = new Headers();

  headers.append(
    "set-cookie",
    serialize(
      TEST_ACCESS_SESSION_COOKIE_NAME,
      sessionToken ? signLocalAccessCookieValue(sessionToken) : "",
      {
        httpOnly: true,
        maxAge: sessionToken ? undefined : 0,
        path: "/",
        sameSite: "lax",
      },
    ),
  );

  return headers;
}

export function extractLocalAccessSessionTokenFromResponseHeaders(
  headers: Headers,
) {
  const setCookie = headers.get("set-cookie");
  const sessionCookie = setCookie?.match(/sb-access-token=([^;]+)/);

  if (!sessionCookie?.[1]) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  const signedToken = sessionCookie[1];
  return verifySignedLocalAccessCookieValue(signedToken);
}

export function createLocalAccessRequestCookie(headers: Headers) {
  const sessionToken =
    extractLocalAccessSessionTokenFromResponseHeaders(headers);

  if (!sessionToken) {
    throw new Error("Expected access auth to return a valid session cookie.");
  }

  return `${TEST_ACCESS_SESSION_COOKIE_NAME}=${signLocalAccessCookieValue(sessionToken)}`;
}

function extractLocalAccessSessionTokenFromRequestHeaders(headers: Headers) {
  const cookies = parse(headers.get("cookie") ?? "");
  const signedToken = cookies[TEST_ACCESS_SESSION_COOKIE_NAME];

  if (!signedToken) {
    return null;
  }

  return verifySignedLocalAccessCookieValue(signedToken);
}

function shouldRefreshLocalAccessSession(expiresAt: Date) {
  return expiresAt.getTime() - Date.now() < ACCESS_SESSION_REFRESH_WINDOW_MS;
}

function hashLocalAccessPassword(password: string) {
  return createLocalAccessPasswordHash(password);
}

export function createLocalAccessPasswordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("hex");

  return `scrypt:${salt}:${hash}`;
}

function verifyLocalAccessPasswordHash(input: {
  hash: string;
  password: string;
}) {
  const [algorithm, salt, expectedHash] = input.hash.split(":");

  if (algorithm !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(input.password, salt, SCRYPT_KEY_LENGTH);
  const expectedHashBuffer = Buffer.from(expectedHash, "hex");

  return (
    actualHash.length === expectedHashBuffer.length &&
    timingSafeEqual(actualHash, expectedHashBuffer)
  );
}

function signLocalAccessCookieValue(value: string) {
  return `${value}.${createLocalAccessCookieSignature(value)}`;
}

function verifySignedLocalAccessCookieValue(signedValue: string) {
  const separatorIndex = signedValue.lastIndexOf(".");

  if (separatorIndex <= 0) {
    return null;
  }

  const value = signedValue.slice(0, separatorIndex);
  const signature = signedValue.slice(separatorIndex + 1);
  const expectedSignature = createLocalAccessCookieSignature(value);

  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  return value;
}

function createLocalAccessCookieSignature(value: string) {
  return createHmac("sha256", getLocalAccessCookieSecret())
    .update(value)
    .digest("hex");
}

function getLocalAccessCookieSecret() {
  return process.env.TEST_ACCESS_AUTH_SECRET ?? "test-access-auth-secret";
}
