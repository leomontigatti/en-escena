import { createBetterAuthAccessAuthProvider } from "@/lib/auth/access-auth-provider.betterauth.server";

export type { AccessCredentialUser } from "@/lib/auth/access-auth-provider.shared.server";

// Forward-only (#266): a single auth implementation. Better Auth always — both in
// production and in the test suite (which runs real Better Auth against
// in-process PGlite, #422). Replacing the internal users' Supabase branches with
// the `admin` plugin lands in #423.
export const accessAuthProvider = createBetterAuthAccessAuthProvider();
