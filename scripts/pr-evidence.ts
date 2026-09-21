import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Attaches UI evidence to a PR from the command line (#1115). `gh` has no
// attachment upload and refuses binaries in gists, so the files go to one
// permanent prerelease, `pr-assets`: a release asset is served from
// `release-assets.githubusercontent.com`, which GitHub's own `img-src` policy
// allows, so the image renders inline in a PR body. Nothing enters git history,
// and one file can be removed later with `gh release delete-asset`.
//
// The script uploads and prints the markdown; it does not edit the PR. The
// body is the author's, and where the evidence sits in it is their call.
//
// This repository is public, so every asset is world-readable. Capture against
// seed data only (docs/agents/pull-requests.md § UI evidence).

export const evidenceReleaseTag = "pr-assets";

/**
 * What renders inline from a release asset. Video is absent on purpose: GitHub
 * only gives its player to files uploaded through the browser, so an `.mp4`
 * here would be a bare link. Motion goes in as a GIF, or is dragged in by hand.
 */
export const inlineImageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

export type EvidenceAsset = { label: string; name: string; url: string };

/**
 * `pr-<number>-<file name>`, lowercased and reduced to what is safe in a URL,
 * so an asset can be traced to its PR and deleted by name.
 */
export function evidenceAssetName(prNumber: number, filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  const stem = path
    .basename(filePath, path.extname(filePath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `pr-${prNumber}-${stem}${extension}`;
}

export function evidenceAssetUrl(repository: string, name: string): string {
  return `https://github.com/${repository}/releases/download/${evidenceReleaseTag}/${name}`;
}

/**
 * `<stem>-before` and `<stem>-after` become one table row; anything without a
 * partner is printed as a plain image under the table.
 */
export function renderEvidenceMarkdown(assets: EvidenceAsset[]): string {
  const image = (asset: EvidenceAsset) => `![${asset.label}](${asset.url})`;
  const stemOf = (asset: EvidenceAsset, suffix: string) =>
    asset.label.endsWith(suffix)
      ? asset.label.slice(0, -suffix.length)
      : undefined;

  const paired = new Set<EvidenceAsset>();
  const rows: string[] = [];

  for (const before of assets) {
    const stem = stemOf(before, "-before");
    const after =
      stem === undefined
        ? undefined
        : assets.find((asset) => stemOf(asset, "-after") === stem);

    if (after) {
      paired.add(before).add(after);
      rows.push(`| ${image(before)} | ${image(after)} |`);
    }
  }

  const blocks: string[] = [];

  if (rows.length > 0) {
    blocks.push(["| Before | After |", "| --- | --- |", ...rows].join("\n"));
  }

  for (const asset of assets) {
    if (!paired.has(asset)) {
      blocks.push(image(asset));
    }
  }

  return blocks.join("\n\n");
}

function gh(args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("gh", args, { encoding: "utf8" });

  return {
    ok: result.status === 0,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

/** The reason a file cannot be evidence, or `undefined` when it can. */
export function evidenceFileProblem(
  file: string,
  exists: (file: string) => boolean = existsSync,
): string | undefined {
  const extension = path.extname(file).toLowerCase();

  if (!exists(file)) {
    return `No such file: ${file}`;
  }

  if (!inlineImageExtensions.includes(extension)) {
    return `${file}: a ${extension || "file without extension"} does not render inline from a release asset. Convert motion to a GIF, or drag the video into the PR by hand.`;
  }

  return undefined;
}

/**
 * gh names the asset after the file (`<path>#<text>` only sets a display
 * label), so the rename happens on disk, in a directory of its own.
 */
function uploadEvidence(
  repository: string,
  prNumber: number,
  files: string[],
): EvidenceAsset[] | string {
  const stagingDirectory = mkdtempSync(path.join(tmpdir(), "pr-evidence-"));

  try {
    return files.map((file) => {
      const name = evidenceAssetName(prNumber, file);
      const staged = path.join(stagingDirectory, name);
      copyFileSync(file, staged);
      const upload = gh([
        "release",
        "upload",
        evidenceReleaseTag,
        staged,
        "--clobber",
      ]);

      if (!upload.ok) {
        throw new Error(upload.stderr);
      }

      return {
        label: path.basename(name, path.extname(name)).replace(/^pr-\d+-/, ""),
        name,
        url: evidenceAssetUrl(repository, name),
      };
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    rmSync(stagingDirectory, { force: true, recursive: true });
  }
}

function fail(message: string) {
  console.error(message);
  process.exitCode = 1;
}

function runPrEvidence() {
  const [prArgument, ...files] = process.argv.slice(2);
  const prNumber = Number(prArgument);

  if (!Number.isInteger(prNumber) || prNumber < 1 || files.length === 0) {
    return fail("Usage: pnpm pr:evidence <pr-number> <image> [<image>...]");
  }

  const problem = files
    .map((file) => evidenceFileProblem(file))
    .find((found) => found !== undefined);

  if (problem) {
    return fail(problem);
  }

  const repository = gh([
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "--jq",
    ".nameWithOwner",
  ]);

  if (!repository.ok) {
    return fail(repository.stderr);
  }

  const assets = uploadEvidence(repository.stdout.trim(), prNumber, files);

  if (typeof assets === "string") {
    return fail(assets);
  }

  console.log(renderEvidenceMarkdown(assets));
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  runPrEvidence();
}
