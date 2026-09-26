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

const readCiWorkflow = async () =>
  await readFile(".github/workflows/ci.yml", "utf8");

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

  // The sharded `db-gate` (#962) has one silent failure mode: growing the
  // matrix without growing the `/N` denominator leaves the extra shards
  // running slices that vitest never assigns, so part of the suite stops
  // running and the gate still goes green. Nothing else pins the two numbers
  // to each other, so pin them here.
  test("runs every DB shard: the matrix size matches the --shard denominator", async () => {
    const ciWorkflow = await readCiWorkflow();

    const matrix = /\n\s*shard: \[([^\]]+)\]/.exec(ciWorkflow);
    expect(matrix).not.toBeNull();
    const shards = matrix![1].split(",").map((entry) => Number(entry.trim()));

    const shardFlag = /--shard=\$\{\{ matrix\.shard \}\}\/(\d+)/.exec(
      ciWorkflow,
    );
    expect(shardFlag).not.toBeNull();
    const denominator = Number(shardFlag![1]);

    expect(shards).toEqual(
      Array.from({ length: denominator }, (_, index) => index + 1),
    );
  });

  // Branch protection on `master` requires the `db-gate` context by name, and
  // required contexts are a repo setting no file here can update. Renaming the
  // job silently stops blocking merges instead of failing loudly.
  test("keeps the required `db-gate` context as the aggregator over the shards", async () => {
    const ciWorkflow = await readCiWorkflow();

    expect(ciWorkflow).toContain("  db-gate:\n    name: db-gate\n");
    expect(ciWorkflow).toContain("needs: [db-shard]");
    // Without `always()` a failed shard leaves `db-gate` skipped, and a skipped
    // required context never reports, so protection waits on it forever.
    expect(ciWorkflow).toContain("if: always()");
    expect(ciWorkflow).toContain("needs.db-shard.result");
    // Every shard has to report, not just the first one to go red.
    expect(ciWorkflow).toContain("fail-fast: false");
  });

  // CI spells the command out instead of calling `pnpm test:db:postgres`,
  // because only CI passes `--shard`. That fork means a config rename can leave
  // the workflow behind, so hold the two to the same config file.
  test("runs the shards against the same config as the Postgres script", async () => {
    const ciWorkflow = await readCiWorkflow();
    const scripts = await readPackageScripts();

    expect(scripts["test:db:postgres"]).toContain("vitest.db.config.ts");
    expect(ciWorkflow).toContain(
      "pnpm db:test:reset && pnpm exec vitest --config vitest.db.config.ts --run --shard=",
    );
  });
});
