import { client } from "@/db";
import { reconcileSupabaseAuthUsers } from "@/lib/auth/supabase-user-reconciliation.server";

// Barrido de reconciliación `auth.users` (Supabase Auth) → `user` (#424). Se
// corre una vez, contra la base del cutover donde todavía conviven ambos schemas.
// Es idempotente: solo inserta las identidades de `auth.users` que aún no tengan
// fila en `user`. NO toca `account` (passwords por reset reactivo, research #364).
//
//   node --env-file-if-exists=.env --import tsx scripts/reconcile-supabase-users.ts
try {
  const summary = await reconcileSupabaseAuthUsers();

  console.log(
    `auth.users=${summary.authUsersCount} user=${summary.userCount} ` +
      `insertados=${summary.insertedEmails.length}`,
  );

  for (const email of summary.insertedEmails) {
    console.log(`+ ${email}`);
  }
} finally {
  await client.end();
}
