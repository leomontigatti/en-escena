import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
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
  // The hook resolves Prettier as `$CLAUDE_PROJECT_DIR/node_modules/.bin/prettier`,
  // so the fake project needs a `node_modules` of its own; symlinking the repo's
  // gets the real binary without a second install.
  symlinkSync(
    path.join(repoRoot, "node_modules"),
    path.join(workdir, "node_modules"),
  );
  // Prettier resolves its config from the file being formatted, which lives in
  // the fixture — without this copy the assertions below would pin Prettier's
  // defaults rather than this repo's settings.
  copyFileSync(
    path.join(repoRoot, ".prettierrc"),
    path.join(workdir, ".prettierrc"),
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

// How Prettier is invoked is not an implementation detail here: the spec fixes
// both halves of it. `--ignore-unknown` is what turns an unsupported path into a
// no-op instead of an error, and going straight to the binary rather than
// through `pnpm exec` is the difference between 93 ms and 0.9 s on a hook that
// fires after every edit. Neither is observable through the real Prettier —
// the hook swallows its output and always exits 0 — so a stub at the process
// boundary is the only place these can be pinned.
describe("format-edited-file.sh — how it invokes Prettier", () => {
  let stubDir: string;
  let argvLog: string;

  beforeEach(() => {
    stubDir = mkdtempSync(path.join(tmpdir(), "format-hook-stub-"));
    argvLog = path.join(stubDir, "argv.log");
    const binDir = path.join(stubDir, "node_modules/.bin");
    mkdirSync(binDir, { recursive: true });
    const stub = path.join(binDir, "prettier");
    writeFileSync(
      stub,
      ["#!/bin/sh", `printf '%s\\n' "$@" >> "${argvLog}"`, "exit 0", ""].join(
        "\n",
      ),
    );
    chmodSync(stub, 0o755);
  });

  afterEach(() => {
    rmSync(stubDir, { recursive: true, force: true });
  });

  function runHookWithStub(filePath: string) {
    return spawnSync("bash", [hook], {
      input: JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: filePath },
      }),
      encoding: "utf8",
      cwd: stubDir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: stubDir },
    });
  }

  it("passes --write and --ignore-unknown, and nothing else", () => {
    const file = path.join(stubDir, "Thing.tsx");
    writeFileSync(file, "export const a = 1;\n");

    const result = runHookWithStub(file);

    expect(result.status).toBe(0);
    expect(readFileSync(argvLog, "utf8").trim().split("\n")).toEqual([
      "--write",
      "--ignore-unknown",
      file,
    ]);
  });

  it("runs the project's Prettier binary, never `pnpm exec`", () => {
    const file = path.join(stubDir, "Thing.tsx");
    writeFileSync(file, "export const a = 1;\n");

    // A `pnpm` on `PATH` that fails loudly: if the hook ever shells out through
    // it, the stub below records nothing and this test goes red.
    const pathDir = path.join(stubDir, "path");
    mkdirSync(pathDir);
    const pnpmStub = path.join(pathDir, "pnpm");
    writeFileSync(pnpmStub, "#!/bin/sh\nexit 97\n");
    chmodSync(pnpmStub, 0o755);

    const result = spawnSync("bash", [hook], {
      input: JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: file },
      }),
      encoding: "utf8",
      cwd: stubDir,
      env: {
        ...process.env,
        PATH: `${pathDir}:${process.env.PATH ?? ""}`,
        CLAUDE_PROJECT_DIR: stubDir,
      },
    });

    expect(result.status).toBe(0);
    expect(existsSync(argvLog)).toBe(true);
  });

  it("is a silent no-op when the project has no Prettier installed", () => {
    const bare = mkdtempSync(path.join(tmpdir(), "format-hook-bare-"));
    const file = path.join(bare, "Thing.tsx");
    writeFileSync(file, "export const a   = 1\n");

    const result = spawnSync("bash", [hook], {
      input: JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: file },
      }),
      encoding: "utf8",
      cwd: bare,
      env: { ...process.env, CLAUDE_PROJECT_DIR: bare },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(readFileSync(file, "utf8")).toBe("export const a   = 1\n");
    rmSync(bare, { recursive: true, force: true });
  });
});
