import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  workflowFiles,
  workflowSteps,
  workflowText,
} from "./pr-workflows.test-support";

// Coverage for #981: the Node version is one fact, so it is written down once.
// `.nvmrc` is that one place; every other copy of it — the `engines.node` range
// npm/pnpm enforce, the `actions/setup-node` steps across the workflows, and the
// Dockerfile base image — either reads the file or is derived from it here, so a
// bump that forgets one of them fails this suite instead of producing a runner
// and a container on different Node versions.

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const read = (file: string): string =>
  readFileSync(`${repoRoot}${file}`, "utf8");

/** The exact version in `.nvmrc`, e.g. `22.23.2`. */
const nvmrc = read(".nvmrc").trim();

const packageJson = JSON.parse(read("package.json")) as {
  engines?: { node?: string };
  devDependencies: Record<string, string>;
};

describe("the Node version the project targets (#981)", () => {
  it("is an exact version in `.nvmrc`", () => {
    expect(nvmrc, "`.nvmrc` pins the patch CI resolves, unprefixed").toMatch(
      /^\d+\.\d+\.\d+$/,
    );
  });

  it("is the floor of `engines.node`, so a stale local Node is refused", () => {
    expect(packageJson.engines?.node).toBe(`^${nvmrc}`);
  });

  it("is the major `@types/node` types the build against", () => {
    const types = packageJson.devDependencies["@types/node"];
    expect(
      /^\^(\d+)\./.exec(types)?.[1],
      "`@types/node` types the runtime in `.nvmrc`; its major has to match",
    ).toBe(nvmrc.split(".")[0]);
  });

  it("is read from the file by every `actions/setup-node` step", () => {
    const setupNodeSteps = workflowFiles().flatMap((file) =>
      workflowSteps(file)
        .filter((step) => step.uses.startsWith("actions/setup-node@"))
        .map((step) => ({ file, step })),
    );
    expect(setupNodeSteps.length).toBeGreaterThan(0);

    for (const { file, step } of setupNodeSteps) {
      expect(
        step.body,
        `${file}: point the step at \`node-version-file: .nvmrc\``,
      ).toMatch(/^\s+node-version-file: \.nvmrc$/m);
    }
  });

  it("is never spelled out as a literal `node-version:` in a workflow", () => {
    for (const file of workflowFiles()) {
      expect(
        workflowText(file),
        `${file}: a literal \`node-version:\` is a second copy of \`.nvmrc\``,
      ).not.toMatch(/^\s+node-version:/m);
    }
  });

  it("is the Dockerfile's base image", () => {
    // A mutable tag by design: pinning the base image by digest is a separate
    // decision that belongs to the Actions gate (#955), not to this one.
    expect(read("Dockerfile")).toMatch(
      new RegExp(
        `^FROM node:${nvmrc.replace(/\./g, "\\.")}-bookworm-slim `,
        "m",
      ),
    );
  });

  it("is documented where a bump has to go", () => {
    expect(read("docs/agents/workflows.md")).toContain(".nvmrc");
  });
});
