import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";

import {
  academies,
  administrativeAuditEntries,
  events,
  user,
} from "@/db/schema";

import {
  createPgliteTestDatabase,
  destroyPgliteTestDatabase,
  resetPgliteTestDatabase,
} from "./pglite";

let testDatabase: Awaited<ReturnType<typeof createPgliteTestDatabase>>;

beforeAll(async () => {
  testDatabase = await createPgliteTestDatabase();
});

afterAll(async () => {
  if (testDatabase) {
    await destroyPgliteTestDatabase(testDatabase);
  }
});

beforeEach(async () => {
  await resetPgliteTestDatabase(testDatabase.db);
});

describe("PGlite pilot", () => {
  test("applies the En Escena schema and resets data between tests", async () => {
    await testDatabase.db.insert(user).values({
      id: "user_1",
      name: "Academia Test",
      email: "academia@example.com",
    });

    const savedUser = await testDatabase.db.query.user.findFirst({
      where: eq(user.email, "academia@example.com"),
    });

    expect(savedUser).toMatchObject({
      id: "user_1",
      email: "academia@example.com",
      emailVerified: false,
      role: "academy",
    });
  });

  test("starts each test from clean data", async () => {
    const users = await testDatabase.db.query.user.findMany();

    expect(users).toEqual([]);
  });

  test("supports enums, foreign keys, constraints, transactions, jsonb, and repository SQL patterns", async () => {
    await testDatabase.db.insert(user).values([
      {
        id: "academy_user",
        name: "Academia Aurora",
        email: "academia@example.com",
      },
      {
        id: "admin_user",
        name: "Administrador Zebra",
        email: "admin@example.com",
        role: "admin",
        internalUsername: "zebra",
      },
    ]);

    await testDatabase.db.insert(academies).values({
      id: "academy_1",
      userId: "academy_user",
      name: "Academia Aurora",
      contactName: "Maria Aurora",
      phone: "+54 11 5555 0000",
    });

    const foreignKeyError = await testDatabase.db
      .insert(academies)
      .values({
        id: "academy_invalid",
        userId: "missing_user",
        name: "Academia Invalida",
        contactName: "Sin Usuario",
        phone: "+54 11 5555 1111",
      })
      .catch((error) => error);

    expect(foreignKeyError).toBeInstanceOf(Error);
    expect(
      readPgliteCauseProperty(foreignKeyError, "code"),
      "PGlite surfaces the Postgres violation code on error.cause",
    ).toBe("23503");
    expect(
      readPgliteCauseProperty(foreignKeyError, "constraint"),
      "PGlite uses error.cause.constraint instead of the postgres-js constraint_name field",
    ).toBe("en_escena_academy_user_id_en_escena_user_id_fk");

    await testDatabase.db.insert(events).values({
      id: "event_1",
      name: "Evento Activo",
      active: true,
      registrationStartsAt: new Date("2026-01-01T00:00:00.000Z"),
      registrationEndsAt: new Date("2026-01-10T00:00:00.000Z"),
      startsAt: new Date("2026-02-01T00:00:00.000Z"),
      endsAt: new Date("2026-02-02T00:00:00.000Z"),
    });

    const activeEventConstraintError = await testDatabase.db
      .insert(events)
      .values({
        id: "event_2",
        name: "Otro Evento Activo",
        active: true,
        registrationStartsAt: new Date("2026-03-01T00:00:00.000Z"),
        registrationEndsAt: new Date("2026-03-10T00:00:00.000Z"),
        startsAt: new Date("2026-04-01T00:00:00.000Z"),
        endsAt: new Date("2026-04-02T00:00:00.000Z"),
      })
      .catch((error) => error);

    expect(activeEventConstraintError).toBeInstanceOf(Error);
    expect(readPgliteCauseProperty(activeEventConstraintError, "code")).toBe(
      "23505",
    );
    expect(
      readPgliteCauseProperty(activeEventConstraintError, "constraint"),
    ).toBe("event_single_active_unique");

    const savedEvent = await testDatabase.db.query.events.findFirst({
      where: eq(events.id, "event_1"),
    });

    expect(savedEvent?.registrationReadinessMissingItems).toEqual([]);

    await testDatabase.db.insert(administrativeAuditEntries).values({
      id: "audit_1",
      entityType: "user",
      entityId: "academy_user",
      adminUserId: "admin_user",
      action: "update",
      beforeValues: { role: "academy" },
      afterValues: { role: "academy", note: "verified" },
    });

    const auditEntry =
      await testDatabase.db.query.administrativeAuditEntries.findFirst({
        where: eq(administrativeAuditEntries.id, "audit_1"),
      });

    expect(auditEntry).toMatchObject({
      beforeValues: { role: "academy" },
      afterValues: { role: "academy", note: "verified" },
    });

    await expect(
      testDatabase.db.transaction(async (tx) => {
        await tx.insert(user).values({
          id: "rolled_back_user",
          name: "Transient User",
          email: "transient@example.com",
        });

        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");

    expect(
      await testDatabase.db.query.user.findFirst({
        where: eq(user.id, "rolled_back_user"),
      }),
    ).toBeUndefined();

    const rows = await testDatabase.db
      .select({
        id: user.id,
        identifier: sql<string>`coalesce(${user.internalUsername}, ${user.email})`,
        academyName: academies.name,
      })
      .from(user)
      .leftJoin(academies, eq(academies.userId, user.id))
      .where(
        and(
          or(
            ilike(user.name, "%aurora%"),
            ilike(user.email, "%aurora%"),
            ilike(academies.contactName, "%aurora%"),
          ) ?? sql`false`,
          eq(user.role, "academy"),
        ),
      )
      .orderBy(
        asc(sql`lower(coalesce(${academies.contactName}, ${user.name}))`),
        asc(sql`lower(coalesce(${user.internalUsername}, ${user.email}))`),
      );

    expect(rows).toEqual([
      {
        id: "academy_user",
        identifier: "academia@example.com",
        academyName: "Academia Aurora",
      },
    ]);
  });
});

type PgliteCauseProperty = "code" | "constraint";

function readPgliteCauseProperty(
  error: unknown,
  propertyName: PgliteCauseProperty,
) {
  if (
    !error ||
    typeof error !== "object" ||
    !("cause" in error) ||
    !error.cause ||
    typeof error.cause !== "object" ||
    !(propertyName in error.cause)
  ) {
    return undefined;
  }

  return error.cause[propertyName as keyof typeof error.cause];
}
