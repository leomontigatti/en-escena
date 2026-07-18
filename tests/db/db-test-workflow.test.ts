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

const deferredProjectSplitDocumentation = [
  "Actualizacion issue #128",
  "No se adopta por ahora una division de proyectos Vitest",
  "Sin una mejora material",
];

const dbWorkflowScopeGuardrails = [
  "Use `pnpm test:db <path-to-db-test>` while iterating",
  "Run `pnpm test` before finishing",
  "Do not run `pnpm exec tsc` directly",
];

const localAuthDatabaseModes = [
  "Default DB validation (`pnpm test:db`, part of `pnpm test`)",
  "does not",
  "require local Postgres once the repo dependencies are installed.",
  "High-fidelity DB validation (`pnpm test:db:postgres`)",
  "requires local Postgres through",
  "`TEST_DATABASE_URL`.",
];

const requiredIsolatedTestExamples = [
  "app/lib/academies/registration.server.db.test.ts",
  "app/lib/auth/access-recovery.server.db.test.ts",
  "app/lib/shared/email.server.test.ts",
  "app/lib/auth/access-auth-provider.server.test.ts",
];

describe("DB test workflow", () => {
  test("uses PGlite for the default DB suite and reserves Postgres for the CI gate", async () => {
    const scripts = await readPackageScripts();

    // `pnpm test` is the single pre-commit confidence command: unit + DB on
    // PGlite, in-process, no local Postgres.
    expect(scripts["test"]).toBe("pnpm test:unit && pnpm test:db");
    expect(scripts["test:unit"]).toBe("vitest --run");

    // The default DB suite runs on PGlite so the AFK implementer/reviewer can
    // run it on a GHA runner with no Postgres service.
    expect(scripts["test:db"]).toContain("vitest.db.fast.config.ts");
    expect(scripts["test:db"]).toContain("--run");

    // Real Postgres is the high-fidelity path reserved for the CI gate (#305).
    expect(scripts["test:db:postgres"]).toContain("vitest.db.config.ts");
    expect(scripts["test:db:postgres"]).toContain("--run");

    // The consolidated model drops the old zoo of aliases.
    expect(scripts["test:db:final"]).toBeUndefined();
    expect(scripts["test:db:fast:full"]).toBeUndefined();
    expect(scripts["test:db:file"]).toBeUndefined();
    expect(scripts["test:db:file:final"]).toBeUndefined();
    expect(scripts["test:db:file:postgres"]).toBeUndefined();
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

    for (const requiredText of deferredProjectSplitDocumentation) {
      expect(speedPlan).toContain(requiredText);
    }

    for (const testPath of requiredIsolatedTestExamples) {
      expect(speedPlan).toContain(testPath);
    }
  });

  test("documents the fast-vs-final DB validation workflow", async () => {
    const workflowDoc = await readFile("docs/agents/workflows.md", "utf8");

    for (const requiredText of dbWorkflowScopeGuardrails) {
      expect(workflowDoc).toContain(requiredText);
    }
  });

  test("documents which DB validation modes require local Postgres", async () => {
    const localAuthDoc = await readFile("docs/local-auth.md", "utf8");

    for (const requiredText of localAuthDatabaseModes) {
      expect(localAuthDoc).toContain(requiredText);
    }
  });
});
