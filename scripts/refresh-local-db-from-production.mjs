import { mkdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

const LOCAL_CONTAINER = "en-escena-postgres";
const LOCAL_DATABASE = "en-escena";
const POSTGRES_IMAGE = "postgres:17-alpine";
const DUMP_DIR = resolve("tmp/db-dumps");
const CONTAINER_DUMP_PATH = "/tmp/en-escena-prod-refresh.dump";
const KEEP_DUMP = process.argv.includes("--keep-dump");

// The production database is `is_public: false` with no published port, so
// there is no route from a laptop to dump it. The source is the artifact
// Coolify's own scheduled backup already wrote on the VPS (7-day local
// retention). See docs/operations/backups.md.
const SSH_HOST = process.env.PROD_SSH_HOST ?? "rylai";
const REMOTE_BACKUP_DIR =
  process.env.BACKUP_DIR ?? "/data/coolify/backups/databases";

async function main() {
  // On a closed stdin the confirmation prompt never resolves and the process
  // would exit 0 having done nothing — a success that refreshed no database.
  if (!process.stdin.isTTY) {
    throw new Error(
      "db:refresh:prod needs an interactive terminal to confirm.",
    );
  }

  console.log("This will replace the local en-escena database.");
  console.log(
    `Source: the newest Coolify backup artifact on ${SSH_HOST}, fetched over scp.`,
  );
  console.log("No production credentials and no live database access.");
  console.log("");

  const confirmed = await promptLine(
    `Type ${LOCAL_DATABASE} to recreate the local database: `,
  );

  if (confirmed !== LOCAL_DATABASE) {
    throw new Error("Confirmation did not match. Aborting.");
  }

  const remotePath = await resolveRemoteArtifact();

  console.log(`\nArtifact: ${SSH_HOST}:${remotePath}`);

  await mkdir(DUMP_DIR, { recursive: true });

  const dumpFile = basename(remotePath);
  const dumpPath = join(DUMP_DIR, dumpFile);

  try {
    await run("scp", [`${SSH_HOST}:'${remotePath}'`, dumpPath]);

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

    // No `db:baseline` here. Coolify dumps the whole `enescena` database with
    // no `--schema` filter, so the `drizzle` schema — and with it the full
    // migration journal — travels inside the artifact. Baselining on top would
    // claim only idx=0 had run and make the next `db:migrate` re-apply every
    // migration after it. Verified by the restore drill in #594.
    await run("docker", [
      "exec",
      LOCAL_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      LOCAL_DATABASE,
      // Without ON_ERROR_STOP, an artifact carrying no `drizzle` schema — a
      // hand-taken `--schema=public` BACKUP_FILE, say — would leave the local
      // database journal-less and still report success.
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "select count(*) as migrations, max(created_at) as watermark from drizzle.__drizzle_migrations;",
    ]);

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

// Picks the newest custom-format artifact under REMOTE_BACKUP_DIR, unless
// BACKUP_FILE names one. Assumes GNU find (-printf), as on rylai — the same
// assumption scripts/restore-drill-database.sh makes.
async function resolveRemoteArtifact() {
  const explicit = process.env.BACKUP_FILE;

  if (explicit) {
    return assertCustomFormat(explicit);
  }

  const newest = await capture("ssh", [
    SSH_HOST,
    newestArtifactCommand(REMOTE_BACKUP_DIR),
  ]);

  if (!newest) {
    throw new Error(
      `No custom-format artifact under ${SSH_HOST}:${REMOTE_BACKUP_DIR}. ` +
        "Run Backup Now on the Coolify Postgres resource, or pass BACKUP_FILE.",
    );
  }

  return assertCustomFormat(newest);
}

// The trailing `cut -d' ' -f2-` keeps paths containing spaces intact; only the
// `%T@` timestamp is stripped. Empty output means "no artifact", including when
// the directory itself is missing: `find` fails, but the pipeline's status is
// `cut`'s.
export function newestArtifactCommand(remoteBackupDir) {
  return `find '${remoteBackupDir}' -type f -name 'pg-dump-*.dmp' -printf '%T@ %p\\n' | sort -rn | head -1 | cut -d' ' -f2-`;
}

// Artifacts predating #594 are gzipped `pg_dumpall` output: plain SQL that
// `pg_restore` cannot read, and whose \connect directives would repoint the
// session mid-restore. Refuse them rather than fail halfway through.
export function assertCustomFormat(remotePath) {
  if (!remotePath.endsWith(".dmp")) {
    throw new Error(
      `Not a custom-format artifact: ${remotePath}. Only .dmp is supported; ` +
        "see the Format section of docs/operations/backups.md.",
    );
  }

  return remotePath;
}

async function capture(command, args) {
  console.log(`\n$ ${[command, ...args].join(" ")}`);

  return new Promise((resolveCapture, rejectCapture) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["inherit", "pipe", "inherit"],
    });

    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.on("error", rejectCapture);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveCapture(stdout.trim());
        return;
      }

      rejectCapture(
        new Error(
          signal
            ? `${command} exited with signal ${signal}`
            : `${command} exited with code ${code}`,
        ),
      );
    });
  });
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

// Only when invoked as `pnpm db:refresh:prod`; the helpers above are imported
// by the colocated test, which must not recreate anybody's local database.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error("");
    console.error(error.message);
    process.exitCode = 1;
  });
}
