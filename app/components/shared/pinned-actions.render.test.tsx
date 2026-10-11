/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { PinnedActions } from "./pinned-actions";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

// The page keeps a focused field out from under the pinned actions through a
// rule that finds them by this attribute: renamed on one side only, tabbing
// stops on fields the actions cover again.
test("marks itself for the page's scroll padding", async () => {
  await renderer.renderAsync(
    <PinnedActions>
      <button type="button">Guardar</button>
    </PinnedActions>,
  );

  const css = readFileSync(
    path.resolve(import.meta.dirname, "../../app.css"),
    "utf8",
  );

  expect(document.querySelector("[data-pinned-actions]")).not.toBeNull();
  expect(css).toMatch(
    /:root:has\(\[data-pinned-actions\]\)\s*\{\s*scroll-padding-bottom:/,
  );
});
