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
  "Use `pnpm test:db:file <path-to-db-test>` while iterating",
  "Run the full `pnpm test:db` command before finishing",
  "Do not run `pnpm exec tsc` directly",
];

const localAuthDatabaseModes = [
  "Fast focused DB validation (`pnpm test:db:file <archivo>`)",
  "does not",
  "require local Postgres once the repo dependencies are installed.",
  "Final DB validation (`pnpm test:db`, `pnpm test:db:final` or",
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
  test("uses Postgres for the default DB suite and keeps PGlite focused", async () => {
    const scripts = await readPackageScripts();
    const defaultDatabaseSuite = scripts["test:db"];
    const focusedDatabaseSuite = scripts["test:db:file"];
    const finalDatabaseSuite = scripts["test:db:final"];
    const postgresDatabaseSuite = scripts["test:db:postgres"];
    const focusedFinalDatabaseSuite = scripts["test:db:file:final"];
    const focusedPostgresDatabaseSuite = scripts["test:db:file:postgres"];

    expect(defaultDatabaseSuite).toBe("pnpm test:db:final");
    expect(focusedDatabaseSuite).toContain("vitest.db.fast.config.ts");
    expect(focusedDatabaseSuite).toContain("--run");
    expect(finalDatabaseSuite).toBe("pnpm test:db:postgres");
    expect(focusedFinalDatabaseSuite).toBe("pnpm test:db:file:postgres");
    expect(postgresDatabaseSuite).toContain("vitest.db.config.ts");
    expect(postgresDatabaseSuite).toContain("--run");
    expect(focusedPostgresDatabaseSuite).toContain("vitest.db.config.ts");
    expect(focusedPostgresDatabaseSuite).toContain("--run");
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
