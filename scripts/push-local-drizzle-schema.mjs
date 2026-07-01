import { spawn } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  fail("DATABASE_URL is required.");
}

let parsedDatabaseUrl;

try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  fail("DATABASE_URL is not a valid URL.");
}

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

if (!localHosts.has(parsedDatabaseUrl.hostname)) {
  fail(
    [
      "Refusing to run drizzle-kit push against a non-local DATABASE_URL.",
      "",
      "Production schema changes must use Supabase SQL migrations:",
      "  pnpm db:migration:new <name>",
      "  pnpm db:migration:dry-run",
      "  pnpm db:migration:advisors",
      "  pnpm db:migration:push",
    ].join("\n"),
  );
}

await run("node", ["node_modules/drizzle-kit/bin.cjs", "push"]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function run(command, args) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", rejectRun);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      rejectRun(
        new Error(
          signal
            ? `${command} exited with signal ${signal}`
            : `${command} exited with code ${code}`,
        ),
      );
    });
  });
}
