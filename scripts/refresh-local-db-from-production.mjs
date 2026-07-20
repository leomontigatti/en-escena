import { mkdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";

const LOCAL_CONTAINER = "en-escena-postgres";
const LOCAL_DATABASE = "en-escena";
const POSTGRES_IMAGE = "postgres:17-alpine";
const DUMP_DIR = resolve("tmp/db-dumps");
const CONTAINER_DUMP_PATH = "/tmp/en-escena-prod-refresh.dump";
const KEEP_DUMP = process.argv.includes("--keep-dump");

async function main() {
  console.log("This will replace the local en-escena database.");
  console.log("Use a Supabase Postgres direct/session connection string.");
  console.log("The URL is only passed to pg_dump and is not written to disk.");
  console.log("");

  const productionDatabaseUrl = await readSecret("Production DATABASE_URL: ");

  validateProductionDatabaseUrl(productionDatabaseUrl);

  const confirmed = await promptLine(
    `Type ${LOCAL_DATABASE} to recreate the local database: `,
  );

  if (confirmed !== LOCAL_DATABASE) {
    throw new Error("Confirmation did not match. Aborting.");
  }

  await mkdir(DUMP_DIR, { recursive: true });

  const dumpPath = join(DUMP_DIR, `en-escena-prod-${timestamp()}.dump`);
  const dumpFile = basename(dumpPath);

  try {
    await run(
      "docker",
      [
        "run",
        "--rm",
        "-e",
        "PROD_DATABASE_URL",
        "-e",
        "DUMP_FILE",
        "-v",
        `${DUMP_DIR}:/dumps`,
        POSTGRES_IMAGE,
        "sh",
        "-lc",
        'pg_dump --format=custom --no-owner --no-acl --schema=public "$PROD_DATABASE_URL" --file="/dumps/$DUMP_FILE"',
      ],
      {
        PROD_DATABASE_URL: productionDatabaseUrl,
        DUMP_FILE: dumpFile,
      },
    );

    await run("docker", [
      "run",
      "--rm",
      "-v",
      `${DUMP_DIR}:/dumps`,
      POSTGRES_IMAGE,
      "sh",
      "-lc",
      `pg_restore --list "/dumps/${dumpFile}" | head -40`,
    ]);

    await run("docker", ["compose", "up", "-d", "postgres"]);

    await run("docker", [
      "exec",
      LOCAL_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${LOCAL_DATABASE}' and pid <> pg_backend_pid();`,
    ]);

    await run("docker", [
      "exec",
      LOCAL_CONTAINER,
      "dropdb",
      "-U",
      "postgres",
      "--if-exists",
      LOCAL_DATABASE,
    ]);

    await run("docker", [
      "exec",
      LOCAL_CONTAINER,
      "createdb",
      "-U",
      "postgres",
      LOCAL_DATABASE,
    ]);

    await run("docker", [
      "exec",
      LOCAL_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      LOCAL_DATABASE,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "drop schema if exists public cascade;",
    ]);

    await run("docker", [
      "cp",
      dumpPath,
      `${LOCAL_CONTAINER}:${CONTAINER_DUMP_PATH}`,
    ]);

    try {
      await run("docker", [
        "exec",
        LOCAL_CONTAINER,
        "pg_restore",
        "--no-owner",
        "--no-acl",
        "-U",
        "postgres",
        "-d",
        LOCAL_DATABASE,
        CONTAINER_DUMP_PATH,
      ]);
    } finally {
      await run("docker", [
        "exec",
        LOCAL_CONTAINER,
        "rm",
        "-f",
        CONTAINER_DUMP_PATH,
      ]);
    }

    // El dump ya trae el schema `public` completo; solo falta el estado de
    // migraciones (vive en el schema `drizzle`, fuera del dump). `db:baseline`
    // registra el baseline como aplicado para que un futuro `db:migrate` corra
    // únicamente las migraciones posteriores. Es también el paso previo al gate
    // zero-diff (refresh → generate debe dar vacío). Nota: cuando existan
    // migraciones post-baseline ya desplegadas en prod, este paso necesitará
    // marcar como aplicadas todas las migraciones hasta HEAD, no solo el 0000.
    await run("pnpm", ["db:baseline"]);

    await run("docker", [
      "exec",
      LOCAL_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      LOCAL_DATABASE,
      "-c",
      `
select 'academies' as table_name, count(*) from en_escena_academy
union all select 'users', count(*) from en_escena_user
union all select 'events', count(*) from en_escena_event
union all select 'choreographies', count(*) from en_escena_choreography
order by table_name;
`,
    ]);

    console.log("");
    console.log("Local database refreshed from production.");
  } finally {
    if (!KEEP_DUMP) {
      await rm(dumpPath, { force: true });
    } else {
      console.log(`Kept dump at ${dumpPath}`);
    }
  }
}

async function promptLine(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function readSecret(question) {
  if (!process.stdin.isTTY) {
    return promptLine(question);
  }

  process.stdout.write(question);

  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolveSecret, rejectSecret) => {
    let value = "";

    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      process.stdout.write("\n");
    };

    const onData = (buffer) => {
      const input = buffer.toString("utf8");

      if (input === "\u0003") {
        cleanup();
        rejectSecret(new Error("Interrupted."));
        return;
      }

      const newlineIndex = input.search(/[\r\n]/);

      if (newlineIndex >= 0) {
        value += input.slice(0, newlineIndex);
        cleanup();
        resolveSecret(value.trim());
        return;
      }

      if (input === "\u007f" || input === "\b") {
        value = value.slice(0, -1);
        return;
      }

      value += input;
    };

    stdin.on("data", onData);
  });
}

function validateProductionDatabaseUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Production DATABASE_URL is not a valid URL.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("Production DATABASE_URL must be a Postgres URL.");
  }

  if (!url.hostname || !url.pathname || url.pathname === "/") {
    throw new Error("Production DATABASE_URL must include host and database.");
  }

  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    throw new Error("Refusing to dump from a localhost URL.");
  }
}

function timestamp() {
  return new Date().toISOString().replace(/\D/g, "").slice(0, 14);
}

async function run(command, args, env = {}) {
  console.log(`\n$ ${[command, ...args].join(" ")}`);

  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
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

main().catch((error) => {
  console.error("");
  console.error(error.message);
  process.exitCode = 1;
});
