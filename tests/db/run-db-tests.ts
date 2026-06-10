import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();

const testFiles = findDatabaseTestFiles(root).sort();

for (const testFile of testFiles) {
  runCommand("npm", ["run", "db:test:push"]);

  const result = spawnSync(
    "vitest",
    [
      "--config",
      "vitest.db.config.ts",
      "--no-file-parallelism",
      "--maxWorkers=1",
      "--sequence.concurrent=false",
      testFile,
    ],
    {
      cwd: root,
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCommand(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function findDatabaseTestFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const testFiles: string[] = [];

  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git") {
      continue;
    }

    const absolutePath = join(directory, entry);
    const stat = statSync(absolutePath);

    if (stat.isDirectory()) {
      testFiles.push(...findDatabaseTestFiles(absolutePath));
      continue;
    }

    if (entry.endsWith(".db.test.ts")) {
      testFiles.push(relative(root, absolutePath));
    }
  }

  return testFiles;
}
