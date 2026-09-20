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

  it("shares its major with the `@types/node` the build types against", () => {
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

    // `workflowSteps` only recognises a step at one indentation, so a step it
    // fails to parse would drop out of the loop below and be asserted over by
    // nobody. Counting the raw mentions first is what makes the sweep total:
    // an unparsed — or deleted — step fails here rather than passing silently.
    const mentions = workflowFiles().flatMap((file) =>
      Array.from(workflowText(file).matchAll(/uses: actions\/setup-node@/g)),
    );
    expect(setupNodeSteps.length, "a `setup-node` step no step parse saw").toBe(
      mentions.length,
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

  it("is the tag of every Dockerfile stage built on a Node image", () => {
    // Every `FROM node:`, not only the first: a second stage on its own Node
    // image is exactly the drift this file exists to catch, and asserting the
    // base line alone would stay green through it. A mutable tag is deliberate
    // — pinning by digest belongs to the Actions gate (#955), not to this.
    const fromNode = Array.from(
      read("Dockerfile").matchAll(/^FROM node:(\S+)/gm),
      ([, tag]) => tag,
    );
    expect(fromNode.length).toBeGreaterThan(0);

    for (const tag of fromNode) {
      expect(tag, "a Dockerfile stage on a Node other than `.nvmrc`'s").toBe(
        `${nvmrc}-bookworm-slim`,
      );
    }
  });
});
