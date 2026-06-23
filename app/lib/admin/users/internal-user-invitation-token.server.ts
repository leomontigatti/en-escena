import { createHash, randomBytes } from "node:crypto";

export function createInternalUserInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInternalUserInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
