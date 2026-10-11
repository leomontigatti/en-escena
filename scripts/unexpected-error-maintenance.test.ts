import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const script = fileURLToPath(
  new URL("./unexpected-error-maintenance.sh", import.meta.url),
);

let binDirectory: string;

// `psql` answers the deletion with a count and the connection query with the
// injected `used|max`; `curl` records its arguments. Both log what they got.
beforeEach(() => {
  binDirectory = mkdtempSync(path.join(tmpdir(), "unexpected-error-job-"));
  writeExecutable(
    "psql",
    `printf '%s\\n' "$*" >> "$FAKE_LOG/psql.log"
case "$*" in
*unexpected-error-retention.sql*) echo "$FAKE_DELETED" ;;
*pg_stat_activity*) echo "$FAKE_CONNECTIONS" ;;
esac`,
  );
  writeExecutable(
    "curl",
    `for argument in "$@"; do printf '%s\\n' "$argument"; done >> "$FAKE_LOG/curl.log"
exit "\${FAKE_CURL_EXIT:-0}"`,
  );
});

afterEach(() => {
  rmSync(binDirectory, { recursive: true, force: true });
});

function writeExecutable(name: string, body: string) {
  const file = path.join(binDirectory, name);
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
}

function run(environment: Record<string, string>) {
  const result = spawnSync("sh", [script], {
    encoding: "utf8",
    env: {
      PATH: `${binDirectory}:${process.env.PATH}`,
      DATABASE_URL: "postgres://postgres@localhost:5432/enescena",
      FAKE_LOG: binDirectory,
      FAKE_DELETED: "0",
      FAKE_CONNECTIONS: "10|100",
      ...environment,
    },
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    psql: readLog("psql"),
    curl: readLog("curl"),
  };
}

function readLog(name: string) {
  try {
    return readFileSync(path.join(binDirectory, `${name}.log`), "utf8");
  } catch {
    // Never called.
    return "";
  }
}

const telegram = {
  TELEGRAM_BOT_TOKEN: "123456:secret-bot-token",
  TELEGRAM_CHAT_ID: "-1001234567890",
};

describe("unexpected-error-maintenance.sh", () => {
  // Which rows the retention deletes is unexpected-error-retention.db.test.ts.
  test("runs the retention and reports what it deleted", () => {
    const result = run({ FAKE_DELETED: "12" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Deleted 12 unexpected error rows");
  });

  test("posts nothing while connections stay under the threshold", () => {
    const result = run({ ...telegram, FAKE_CONNECTIONS: "79|100" });

    expect(result.status).toBe(0);
    expect(result.curl).toBe("");
  });

  test("posts to the ops chat once connections reach the threshold", () => {
    const result = run({
      ...telegram,
      TELEGRAM_TOPIC_ID: "42",
      FAKE_CONNECTIONS: "85|100",
    });

    expect(result.status).toBe(0);
    const curlArguments = result.curl.split("\n");
    expect(curlArguments).toContain(
      "https://api.telegram.org/bot123456:secret-bot-token/sendMessage",
    );
    expect(curlArguments).toContain("chat_id=-1001234567890");
    expect(curlArguments).toContain("message_thread_id=42");
    expect(result.curl).toContain(
      "text=[postgres:connections] 85 of 100 connections in use (85%), alert at 80%",
    );
  });

  test("takes its threshold from the environment", () => {
    const result = run({
      ...telegram,
      CONNECTION_ALERT_PERCENT: "50",
      FAKE_CONNECTIONS: "60|100",
    });

    expect(result.curl).toContain("alert at 50%");
  });

  test("prints the alert instead of sending it when Telegram is not configured", () => {
    const result = run({ FAKE_CONNECTIONS: "95|100" });

    expect(result.status).toBe(0);
    expect(result.curl).toBe("");
    expect(result.stdout).toContain("not sent");
  });

  test("fails the task when the post fails, without printing the token", () => {
    const result = run({
      ...telegram,
      FAKE_CONNECTIONS: "95|100",
      FAKE_CURL_EXIT: "22",
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain(
      "secret-bot-token",
    );
  });

  test("posts to the chat itself when the topic is not a number", () => {
    const result = run({
      ...telegram,
      TELEGRAM_TOPIC_ID: "general",
      FAKE_CONNECTIONS: "95|100",
    });

    expect(result.status).toBe(0);
    expect(result.curl).toContain("chat_id=-1001234567890");
    expect(result.curl).not.toContain("message_thread_id");
  });

  test.each(["80%", "0", "101", "00000000000000000000080"])(
    "refuses the threshold %s",
    (threshold) => {
      const result = run({ CONNECTION_ALERT_PERCENT: threshold });

      expect(result.status).not.toBe(0);
      expect(result.psql).toBe("");
    },
  );
});
