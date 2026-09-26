/** @vitest-environment jsdom */

import { act } from "react";
import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { useMergeDialogState } from "./dialog";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

let latest: ReturnType<typeof useMergeDialogState>;

function Probe({
  actionData,
  recordId,
}: {
  actionData?: { status: string; message?: string };
  recordId: string;
}) {
  latest = useMergeDialogState(recordId, actionData);

  return null;
}

describe("useMergeDialogState", () => {
  // A merge redirects to the survivor's page, the same route component with
  // another id: the dialog opened on the removed record must not follow.
  test("closes when the page moves to another record", async () => {
    await renderer.renderAsync(<Probe recordId="removed" />);

    await act(async () => {
      latest.onOpenChange(true);
    });

    expect(latest.open).toBe(true);

    await renderer.renderAsync(<Probe recordId="survivor" />);

    expect(latest.open).toBe(false);
  });

  test("opens with the reason when the server refuses the merge", async () => {
    await renderer.renderAsync(
      <Probe
        actionData={{ status: "merge-refused", message: "No se puede." }}
        recordId="removed"
      />,
    );

    expect(latest).toMatchObject({ open: true, refusal: "No se puede." });
  });
});
