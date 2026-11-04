import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DB_SHARD_COUNT, parseShard } from "./test-db-shard";

describe("parseShard", () => {
  it("accepts every shard the CI matrix runs", () => {
    for (let shard = 1; shard <= DB_SHARD_COUNT; shard += 1) {
      expect(parseShard([String(shard)])).toEqual({ ok: true, shard });
    }
  });

  it.each([
    [[]],
    [["0"]],
    [["5"]],
    [["3/4"]],
    [["abc"]],
    [["1.5"]],
    [["3", "4"]],
  ])("refuses %j with the usage line", (args) => {
    const result = parseShard(args);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain(
      `Usage: pnpm test:db:shard <1-${DB_SHARD_COUNT}>`,
    );
  });
});

describe("DB_SHARD_COUNT", () => {
  it("matches the db-shard matrix in ci.yml", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain(
      `--shard=\${{ matrix.shard }}/${DB_SHARD_COUNT}`,
    );
    const shards = Array.from({ length: DB_SHARD_COUNT }, (_, i) => i + 1);
    expect(workflow).toContain(`shard: [${shards.join(", ")}]`);
  });
});
