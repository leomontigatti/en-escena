import { mkdir, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
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
  console.log("This will replace the local en-escena database.");
  console.log("No production credentials and no live database access.");
  console.log("");

  // The prompt guards a human at a terminal, for whom this command may be a
  // slip: it drops and recreates the local database. A non-interactive run —
  // an agent asked for the refresh, a script, a piped shell — already said what
  // it wanted and has nobody to answer, so it proceeds instead of hanging on a
  // question no one will read.
  if (process.stdin.isTTY) {
    const confirmed = await promptLine(
      `Type ${LOCAL_DATABASE} to recreate the local database: `,
    );

    if (confirmed !== LOCAL_DATABASE) {
      throw new Error("Confirmation did not match. Aborting.");
    }
  }

  const artifact = await resolveArtifact();

  console.log(
    artifact.origin === "local"
      ? `\nArtifact: ${artifact.path} (already local)`
      : `\nArtifact: ${SSH_HOST}:${artifact.path}`,
  );

  const dumpPath =
    artifact.origin === "local"
      ? artifact.path
      : join(DUMP_DIR, basename(artifact.path));

  const dumpFile = basename(dumpPath);

  try {
    if (artifact.origin === "remote") {
      await mkdir(DUMP_DIR, { recursive: true });
      await run("scp", [remoteScpSource(SSH_HOST, artifact.path), dumpPath]);
    }

    await run("docker", [
      "run",
      "--rm",
      "-v",
      // Not DUMP_DIR: a dump named by BACKUP_FILE can sit anywhere on disk.
      `${dirname(dumpPath)}:/dumps`,
      POSTGRES_IMAGE,
      "sh",
      "-lc",
      `pg_restore --list "/dumps/${dumpFile}" | head -40`,
    ]);

    // `--wait` holds until the healthcheck in docker-compose.yml passes.
    // Without it `up -d` returns as soon as the container exists, and when
    // Compose has just recreated it the `psql` below reaches a server that is
    // still starting: "connection to server on socket ... failed: No such file
    // or directory". An already-healthy container makes the wait a no-op.
    await run("docker", ["compose", "up", "-d", "--wait", "postgres"]);

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

    // The `public` schema created by `createdb` is deliberately left in place.
    // A whole-database dump does not recreate it — only non-default schemas
    // like `drizzle` carry a CREATE SCHEMA — so dropping it here makes every
    // `public` object fail to restore ("schema public does not exist"), while
    // `drizzle` restores fine and hides the damage behind a plausible journal.
    // The drop was correct for the `pg_dump --schema=public` this script used
    // before #595: explicit schema selection does emit CREATE SCHEMA public.

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
        // The target database is freshly created, so nothing here is expected
        // to fail. Stopping at the first error beats scrolling hundreds of
        // them past and reading the count at the end.
        "--exit-on-error",
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
    // Only the copy this run fetched is this run's to delete. A dump that was
    // already on disk belongs to whoever put it there, and removing it would
    // make "restore from this file again" a one-shot.
    if (artifact.origin === "local") {
      console.log(`Left ${dumpPath} where it was.`);
    } else if (KEEP_DUMP) {
      console.log(`Kept dump at ${dumpPath}`);
    } else {
      await rm(dumpPath, { force: true });
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

// Which dump to restore, in order: BACKUP_FILE names one outright, BACKUP_ON
// picks the newest of a given day, and the default is the newest there is.
// Assumes GNU find (-printf, -newermt), as on rylai — the same assumption
// scripts/restore-drill-database.sh makes.
async function resolveArtifact() {
  const explicit = process.env.BACKUP_FILE;

  if (explicit) {
    const path = assertCustomFormat(explicit);

    // A path that exists here is restored where it lies: no scp, and no second
    // copy of production data on the disk. Everything else is a remote path —
    // including a local one that is missing, which fails at the fetch with the
    // path in the message rather than silently meaning something else.
    // Absolute, because `docker run -v` rejects a relative source.
    return (await isFile(path))
      ? { origin: "local", path: resolve(path) }
      : { origin: "remote", path };
  }

  const on = process.env.BACKUP_ON;

  if (on) {
    const match = await capture("ssh", [
      SSH_HOST,
      artifactOnDateCommand(REMOTE_BACKUP_DIR, assertIsoDate(on)),
    ]);

    if (!match) {
      const dates = await capture("ssh", [
        SSH_HOST,
        availableDatesCommand(REMOTE_BACKUP_DIR),
      ]);

      throw new Error(
        `No artifact written on ${on} under ${SSH_HOST}:${REMOTE_BACKUP_DIR}.` +
          (dates
            ? ` Available: ${dates.split("\n").join(", ")}.`
            : " There are none at all; run Backup Now on the Coolify Postgres resource."),
      );
    }

    return { origin: "remote", path: assertCustomFormat(match) };
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

  return { origin: "remote", path: assertCustomFormat(newest) };
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

// The remote path must NOT be quoted. Since OpenSSH 9.0 `scp` speaks the SFTP
// protocol by default, so there is no remote shell to strip quotes and any
// added would become part of the filename ("No such file or directory").
// Spaces need no escaping for the same reason: SFTP takes the path literally.
// `ssh` below is the opposite case — its command *is* run by a remote shell,
// which is why the directory there is quoted.
export function remoteScpSource(host, remotePath) {
  return `${host}:${remotePath}`;
}

// The trailing `cut -d' ' -f2-` keeps paths containing spaces intact; only the
// `%T@` timestamp is stripped. Empty output means "no artifact", including when
// the directory itself is missing: `find` fails, but the pipeline's status is
// `cut`'s.
export function newestArtifactCommand(remoteBackupDir) {
  return `find '${remoteBackupDir}' -type f -name 'pg-dump-*.dmp' -printf '%T@ %p\\n' | sort -rn | head -1 | cut -d' ' -f2-`;
}

// The newest artifact written on a single day, by mtime in the server's time
// zone. `-newermt <date> ! -newermt <date+1>` is a half-open day: `find` reads
// both through GNU date, so "2026-09-12 + 1 day" needs no calendar arithmetic
// here and gets month and year ends right.
export function artifactOnDateCommand(remoteBackupDir, isoDate) {
  return `find '${remoteBackupDir}' -type f -name 'pg-dump-*.dmp' -newermt '${isoDate}' ! -newermt '${isoDate} + 1 day' -printf '%T@ %p\\n' | sort -rn | head -1 | cut -d' ' -f2-`;
}

// Every day that has an artifact, newest first — what the failed lookup above
// shows instead of just saying no.
export function availableDatesCommand(remoteBackupDir) {
  return `find '${remoteBackupDir}' -type f -name 'pg-dump-*.dmp' -printf '%TY-%Tm-%Td\\n' | sort -ru`;
}

// BACKUP_ON reaches a remote shell inside single quotes, so a stray quote would
// end the argument and the rest would run as its own command. Only a calendar
// date gets through, and the shape is also what GNU date can read.
export function assertIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`BACKUP_ON must be a YYYY-MM-DD date, got: ${value}`);
  }

  return value;
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
