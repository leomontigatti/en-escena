import { spawn } from "node:child_process";
import readline from "node:readline/promises";

const CONFIRMATION = "push schema to production";

async function main() {
  console.log("This will push the local Drizzle schema to production.");
  console.log("Use a Supabase Postgres direct/session connection string.");
  console.log(
    "The URL is only passed to drizzle-kit and is not written to disk.",
  );
  console.log("");

  const productionDatabaseUrl = await readSecret("Production DATABASE_URL: ");

  validateProductionDatabaseUrl(productionDatabaseUrl);

  const hostname = new URL(productionDatabaseUrl).hostname;

  console.log("");
  console.log(`Target host: ${hostname}`);
  console.log(
    "This can alter production tables. Review pending schema changes first.",
  );

  const confirmed = await promptLine(
    `Type "${CONFIRMATION}" to push the schema: `,
  );

  if (confirmed !== CONFIRMATION) {
    throw new Error("Confirmation did not match. Aborting.");
  }

  await run("drizzle-kit", ["push", "--config=drizzle.config.ts"], {
    DATABASE_URL: productionDatabaseUrl,
  });

  console.log("");
  console.log("Production schema push finished.");
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
    throw new Error("Refusing to push schema to a localhost URL.");
  }
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
