import { createBetterAuthAccessAuthProvider } from "@/lib/auth/access-auth-provider.betterauth.server";

export type { AccessCredentialUser } from "@/lib/auth/access-auth-provider.shared.server";

// Forward-only (#266): una sola implementación de auth. Better Auth siempre —
// tanto en prod como en la suite de tests (que corre Better Auth real contra
// PGlite in-process, #422). El reemplazo de las ramas Supabase de los internos
// por el plugin `admin` llega en #423.
export const accessAuthProvider = createBetterAuthAccessAuthProvider();
