import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { db } from "@/db";
import { user } from "@/db/schema";
import { reconcileSupabaseAuthUsers } from "@/lib/auth/supabase-user-reconciliation.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

// El harness solo trunca las tablas `en_escena_*`; `auth.users` la creamos y
// vaciamos acá para simular el schema de Supabase Auth durante el cutover.
beforeEach(async () => {
  await db.execute(sql`create schema if not exists auth`);
  await db.execute(sql`
    create table if not exists auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz
    )
  `);
  await db.execute(sql`truncate table auth.users`);
});

afterAll(async () => {
  await db.execute(sql`drop table if exists auth.users`);
});

describe("reconcile supabase auth users", () => {
  test("inserts a user row for each auth.users email missing in user", async () => {
    const presentId = "11111111-1111-4111-8111-111111111111";
    const missingId = "22222222-2222-4222-8222-222222222222";

    await db.insert(user).values({
      id: presentId,
      name: "Presente",
      email: "presente@example.com",
    });

    await db.execute(sql`
      insert into auth.users (id, email, email_confirmed_at) values
        (${presentId}, 'presente@example.com', now()),
        (${missingId}, 'faltante@example.com', now())
    `);

    const summary = await reconcileSupabaseAuthUsers();

    expect(summary.authUsersCount).toBe(2);
    expect(summary.userCount).toBe(2);
    expect(summary.insertedEmails).toEqual(["faltante@example.com"]);

    const inserted = await db.query.user.findFirst({
      where: (fields, { eq }) => eq(fields.id, missingId),
    });
    expect(inserted).toMatchObject({
      id: missingId,
      email: "faltante@example.com",
      emailVerified: true,
    });
  });

  test("does not create account rows for the inserted users", async () => {
    const missingId = "33333333-3333-4333-8333-333333333333";

    await db.execute(sql`
      insert into auth.users (id, email, email_confirmed_at)
      values (${missingId}, 'sin-cuenta@example.com', now())
    `);

    await reconcileSupabaseAuthUsers();

    const accounts = await db.query.account.findMany({
      where: (fields, { eq }) => eq(fields.userId, missingId),
    });
    expect(accounts).toEqual([]);
  });

  test("marks users without a confirmed email as unverified and matches case-insensitively", async () => {
    const confirmedId = "44444444-4444-4444-8444-444444444444";
    const existingId = "55555555-5555-4555-8555-555555555555";

    await db.insert(user).values({
      id: existingId,
      name: "Existe",
      email: "existe@example.com",
    });

    await db.execute(sql`
      insert into auth.users (id, email, email_confirmed_at) values
        (${confirmedId}, 'sin-confirmar@example.com', null),
        (${existingId}, 'Existe@Example.com', now())
    `);

    const summary = await reconcileSupabaseAuthUsers();

    // El email en mayúsculas ya existe (comparación case-insensitive): no se
    // reinserta. Solo entra el usuario sin confirmar.
    expect(summary.insertedEmails).toEqual(["sin-confirmar@example.com"]);

    const inserted = await db.query.user.findFirst({
      where: (fields, { eq }) => eq(fields.id, confirmedId),
    });
    expect(inserted?.emailVerified).toBe(false);
  });
});
