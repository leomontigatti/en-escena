import { sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import { normalizeEmail } from "@/lib/shared/email-normalization";

// Reconciliación `auth.users` (Supabase Auth / GoTrue) → `user` (#424, research
// #364). NO reimporta credenciales: las contraseñas migran por reset reactivo, y
// tampoco pre-crea filas `account` (`resetPassword` crea la credential si falta,
// `requestPasswordReset` es no-op si el user no existe). Solo garantiza que cada
// identidad de `auth.users` tenga su fila en `user`: `user.id` ya calca los UUID
// de Supabase (poblado lazy), así que las filas faltantes se insertan con ese
// mismo id para preservar la relación 1:1.
//
// Barrido de solo lectura salvo los INSERT de las filas faltantes. Se corre una
// vez, contra la base donde conviven `auth.users` y `user` durante el cutover
// (ver `scripts/reconcile-supabase-users.ts`).

type Database = Pick<typeof db, "execute" | "insert">;

type SupabaseAuthUserRow = {
  id: string;
  email: string;
  email_confirmed_at: string | Date | null;
};

export type SupabaseUserReconciliationSummary = {
  authUsersCount: number;
  userCount: number;
  insertedEmails: string[];
};

export async function reconcileSupabaseAuthUsers(
  database: Database = db,
): Promise<SupabaseUserReconciliationSummary> {
  const authUsersCount = await readCount(
    database,
    sql`select count(*)::int as count from auth.users where email is not null`,
  );
  const userCount = await readCount(
    database,
    sql`select count(*)::int as count from en_escena_user`,
  );

  const missingRows = readRows<SupabaseAuthUserRow>(
    await database.execute(sql`
      select u.id, u.email, u.email_confirmed_at
      from auth.users u
      where u.email is not null
        and not exists (
          select 1
          from en_escena_user e
          where lower(e.email) = lower(u.email)
        )
      order by u.email
    `),
  );

  const insertedEmails: string[] = [];

  for (const row of missingRows) {
    const email = normalizeEmail(row.email);

    await database.insert(user).values({
      id: row.id,
      name: email,
      email,
      emailVerified: row.email_confirmed_at !== null,
    });

    insertedEmails.push(email);
  }

  return {
    authUsersCount,
    userCount: userCount + insertedEmails.length,
    insertedEmails,
  };
}

async function readCount(database: Database, query: ReturnType<typeof sql>) {
  const rows = readRows<{ count: number | string }>(
    await database.execute(query),
  );
  return Number(rows[0]?.count ?? 0);
}

function readRows<Row extends object>(result: { rows: Row[] } | Row[]): Row[] {
  return Array.isArray(result) ? result : result.rows;
}
