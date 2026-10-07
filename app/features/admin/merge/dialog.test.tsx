/** @vitest-environment jsdom */

import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { useMergeDialogState } from "./dialog";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: {
    error: (message: string) => toastError(message),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
  toastError.mockClear();
});

let latest: ReturnType<typeof useMergeDialogState>;

const mergeIntent = "merge-dancer";

function Probe({
  actionData,
  recordId,
}: {
  actionData?: { status: string; intent?: string; message?: string };
  recordId: string;
}) {
  latest = useMergeDialogState(recordId, actionData, mergeIntent);

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

  // The refusal is the server's, so it is a toast; the dialog opens again under
  // it, with the same choice to make.
  test("opens again and toasts the reason when the server refuses the merge", async () => {
    await renderer.renderAsync(
      <Probe
        actionData={{
          status: "error",
          intent: mergeIntent,
          message: "No se puede.",
        }}
        recordId="removed"
      />,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(latest.open).toBe(true);
    expect(toastError).toHaveBeenCalledWith("No se puede.");
  });

  // The refusal is an error like any other; the intent is what makes it the
  // dialog's, so another form's error neither opens it nor toasts through it.
  test.each([
    ["an error of another intent", { intent: "update-dancer" }],
    ["an error with no intent", {}],
  ])("leaves %s to its own form", async (_label, tag) => {
    await renderer.renderAsync(
      <Probe
        actionData={{ status: "error", message: "No se pudo.", ...tag }}
        recordId="removed"
      />,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(latest.open).toBe(false);
    expect(toastError).not.toHaveBeenCalled();
  });
});
