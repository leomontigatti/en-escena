import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { user } from "@/db/schema";

import { installDatabaseTestHooks } from "./harness";

installDatabaseTestHooks();

describe("database test harness", () => {
  test("runs queries against the test database", async () => {
    await db.insert(user).values({
      id: "user_1",
      name: "Academia Test",
      email: "academia@example.com",
    });

    const savedUser = await db.query.user.findFirst({
      where: eq(user.email, "academia@example.com"),
    });

    expect(savedUser).toMatchObject({
      id: "user_1",
      email: "academia@example.com",
      emailVerified: false,
      role: "academy",
    });
  });

  test("resets data before each test", async () => {
    const users = await db.query.user.findMany();

    expect(users).toEqual([]);
  });
});
