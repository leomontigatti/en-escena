import { configDefaults } from "vitest/config";

// With output going to a file or a pipe, Vitest's default reporter stays silent
// until the end, and a suite of several minutes looks stuck. The dots show it
// moving. A terminal and CI keep the defaults, which carry GitHub's annotations.
export const testReporters =
  process.stdout.isTTY || process.env.CI ? configDefaults.reporters : ["dot"];
