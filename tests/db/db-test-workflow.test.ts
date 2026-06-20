import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import fastDatabaseConfig from "../../vitest.db.fast.config";
import postgresDatabaseConfig from "../../vitest.db.config";

type DatabaseTestConfig = {
  test?: {
    fileParallelism?: boolean;
    maxWorkers?: number | string;
    setupFiles?: string[];
  };
};

describe("DB test workflow", () => {
  test("uses the fast harness for the default DB suite and keeps Postgres as a separate path", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["test:db"]).toContain(
      "vitest.db.fast.config.ts",
    );
    expect(packageJson.scripts["test:db:postgres"]).toContain(
      "vitest.db.config.ts",
    );
    expect(packageJson.scripts["test:db"]).toContain("--run");
    expect(packageJson.scripts["test:db:postgres"]).toContain("--run");
  });

  test("keeps fast DB runs worker-safe and leaves the Postgres suite serialized", () => {
    const fastTestConfig = (fastDatabaseConfig as DatabaseTestConfig).test;
    const postgresTestConfig = (postgresDatabaseConfig as DatabaseTestConfig)
      .test;

    expect(fastTestConfig?.fileParallelism).toBe(true);
    expect(fastTestConfig?.maxWorkers).not.toBe(1);
    expect(fastTestConfig?.setupFiles).toEqual(["./tests/db/setup-fast.ts"]);

    expect(postgresTestConfig?.fileParallelism).toBe(false);
    expect(postgresTestConfig?.maxWorkers).toBe(1);
    expect(postgresTestConfig?.setupFiles).toEqual(["./tests/db/setup.ts"]);
  });
});
