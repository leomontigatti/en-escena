import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { assetKindPolicies } from "@/lib/storage/asset-kinds";

// The storage backup copies only the bucket directories it is named, so a new
// asset kind is silently unbacked until every default list learns about it
// (#1177). These three scripts and the runbook sample are that list.
const BUCKET_LIST_SCRIPTS = [
  "backup-storage-to-b2.sh",
  "restore-drill-from-b2.sh",
  "reseed-storage-volume-from-b2.sh",
];

const repositoryRoot = path.join(import.meta.dirname, "..");

const readRepositoryFile = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const parseBucketList = (value: string) =>
  value
    .split(",")
    .map((bucket) => bucket.trim())
    .filter((bucket) => bucket.length > 0)
    .sort();

const readScriptBucketDefault = (scriptName: string) => {
  const source = readRepositoryFile(path.join("scripts", scriptName));
  const match = source.match(
    /STORAGE_BACKUP_BUCKETS="\$\{STORAGE_BACKUP_BUCKETS:-([^}]*)\}"/,
  );

  if (!match) {
    throw new Error(
      `${scriptName} has no STORAGE_BACKUP_BUCKETS default to read`,
    );
  }

  return match[1];
};

const declaredBuckets = Object.values(assetKindPolicies)
  .map((policy) => policy.bucket)
  .sort();

describe("storage backup bucket lists", () => {
  test("every asset kind's bucket is in each script's default", () => {
    for (const scriptName of BUCKET_LIST_SCRIPTS) {
      expect(
        parseBucketList(readScriptBucketDefault(scriptName)),
        `${scriptName} default bucket list`,
      ).toEqual(declaredBuckets);
    }
  });

  test("the three scripts state the same default, character for character", () => {
    const defaults = BUCKET_LIST_SCRIPTS.map(readScriptBucketDefault);

    expect(new Set(defaults).size).toBe(1);
  });

  test("the backups runbook's sample lists the same buckets", () => {
    const runbook = readRepositoryFile("docs/operations/backups.md");
    const match = runbook.match(/STORAGE_BACKUP_BUCKETS="([^"]*)"/);

    expect(match).not.toBeNull();
    expect(parseBucketList(match?.[1] ?? "")).toEqual(declaredBuckets);
  });

  test("the sample environment lists the same buckets", () => {
    const sample = readRepositoryFile(".env.example");
    const match = sample.match(/STORAGE_BACKUP_BUCKETS="([^"]*)"/);

    expect(match).not.toBeNull();
    expect(parseBucketList(match?.[1] ?? "")).toEqual(declaredBuckets);
  });

  test("the infrastructure doc gives the feedback audio bucket its own contract", () => {
    const infrastructure = readRepositoryFile(
      "docs/operations/infrastructure.md",
    );

    expect(infrastructure).toContain("### `Devolución` audio contract");
    expect(infrastructure).toContain("en-escena-feedback-audio");
    expect(infrastructure).toContain("STORAGE_BACKUP_BUCKETS");
  });

  test("the runbook records the manual production step for the feedback audio bucket", () => {
    const runbook = readRepositoryFile("docs/operations/backups.md");

    expect(runbook).toContain("en-escena-feedback-audio");
    expect(runbook).toMatch(/Pending production step/);
  });
});
