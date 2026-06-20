import * as schema from "@/db/schema";

const { internalInvitationTokens: _internalInvitationTokens, ...pgliteSchema } =
  schema;

export { pgliteSchema };
