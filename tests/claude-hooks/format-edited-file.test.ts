import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// #982: the `PostToolUse` formatter on `Write|Edit`. Formatting stops being the
// agent's job, so the hook has to be invisible: it writes the file and says
// nothing, because `PostToolUse` stderr is fed back to Claude and a reformat is
// not something the agent should react to.

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const hook = path.join(repoRoot, ".claude/hooks/format-edited-file.sh");

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(path.join(tmpdir(), "format-hook-"));
  // The hook calls `$CLAUDE_PROJECT_DIR/node_modules/.bin/prettier`, and
  // Prettier resolves its ignore file from the working directory — so the fake
  // project needs the real Prettier, not the real repo.
  symlinkSync(
    path.join(repoRoot, "node_modules"),
    path.join(workdir, "node_modules"),
  );
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

/** Runs the hook the way Claude Code does: the event JSON on stdin. */
function runHook(filePath: string) {
  return spawnSync("bash", [hook], {
    input: JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: filePath },
    }),
    encoding: "utf8",
    cwd: workdir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: workdir },
  });
}

describe("format-edited-file.sh", () => {
  it("leaves a badly formatted .tsx Prettier-formatted on disk, silently", () => {
    const file = path.join(workdir, "Badly.tsx");
    writeFileSync(file, "export const a   =    ()=>{return <p>hola</p>}\n");

    const result = runHook(file);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(readFileSync(file, "utf8")).toBe(
      "export const a = () => {\n  return <p>hola</p>;\n};\n",
    );
  });

  it("is a silent no-op on a path Prettier has no parser for", () => {
    const file = path.join(workdir, "image.png");
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    writeFileSync(file, bytes);

    const result = runHook(file);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(readFileSync(file)).toEqual(bytes);
  });

  it("exits 0 when the event carries no file path", () => {
    const result = spawnSync("bash", [hook], {
      input: JSON.stringify({ tool_name: "Write", tool_input: {} }),
      encoding: "utf8",
      cwd: workdir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: workdir },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
