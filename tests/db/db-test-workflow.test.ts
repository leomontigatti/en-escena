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

const readPackageScripts = async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };

  return packageJson.scripts;
};

describe("DB test workflow", () => {
  test("uses the fast harness for the default DB suite and keeps Postgres as a separate path", async () => {
    const scripts = await readPackageScripts();
    const defaultDatabaseSuite = scripts["test:db"];
    const postgresDatabaseSuite = scripts["test:db:postgres"];

    expect(defaultDatabaseSuite).toContain("vitest.db.fast.config.ts");
    expect(defaultDatabaseSuite).toContain("--run");
    expect(postgresDatabaseSuite).toContain("vitest.db.config.ts");
    expect(postgresDatabaseSuite).toContain("--run");
  });

  test("keeps fast DB runs worker-safe and leaves the Postgres suite serialized", () => {
    const fastTestConfig = (fastDatabaseConfig as DatabaseTestConfig).test;
    const postgresTestConfig = (postgresDatabaseConfig as DatabaseTestConfig)
      .test;

    expect(fastTestConfig?.fileParallelism).toBe(true);
    expect(fastTestConfig?.maxWorkers).toBe("50%");
    expect(fastTestConfig?.setupFiles).toEqual(["./tests/db/setup-fast.ts"]);

    expect(postgresTestConfig?.fileParallelism).toBe(false);
    expect(postgresTestConfig?.maxWorkers).toBe(1);
    expect(postgresTestConfig?.setupFiles).toEqual(["./tests/db/setup.ts"]);
  });

  test("documents why Vitest project splitting stays deferred after the DB isolation rollout", async () => {
    const speedPlan = await readFile(
      "docs/agents/test-suite-speed-plan.md",
      "utf8",
    );

    expect(speedPlan).toContain("Actualizacion issue #128");
    expect(speedPlan).toContain(
      "No se adopta por ahora una division de proyectos Vitest",
    );
    expect(speedPlan).toContain(
      "app/lib/academies/registration.server.db.test.ts",
    );
    expect(speedPlan).toContain(
      "app/lib/auth/access-recovery.server.db.test.ts",
    );
    expect(speedPlan).toContain("app/lib/shared/email.server.test.ts");
    expect(speedPlan).toContain(
      "app/lib/auth/access-auth-provider.server.test.ts",
    );
    expect(speedPlan).toContain("Sin una mejora material");
  });
});
