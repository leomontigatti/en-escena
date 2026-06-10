import { createHash, randomBytes } from "node:crypto";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashRegistrationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createRegistrationToken() {
  return randomBytes(32).toString("base64url");
}
