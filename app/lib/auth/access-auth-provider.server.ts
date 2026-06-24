import { createLocalTestAccessAuthProvider } from "@/lib/auth/access-auth-provider.local.server";
import { isTestAccessAuthMode } from "@/lib/auth/access-auth-provider.shared.server";
import { createSupabaseAccessAuthProvider } from "@/lib/auth/access-auth-provider.supabase.server";

export type { AccessCredentialUser } from "@/lib/auth/access-auth-provider.shared.server";

export const accessAuthProvider = isTestAccessAuthMode()
  ? createLocalTestAccessAuthProvider()
  : createSupabaseAccessAuthProvider();
