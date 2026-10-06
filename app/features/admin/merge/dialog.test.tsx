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

  // The refusal is the server's, so it is a toast; the dialog opens again under
  // it, with the same choice to make.
  test("opens again and toasts the reason when the server refuses the merge", async () => {
    await renderer.renderAsync(
      <Probe
        actionData={{ status: "merge-refused", message: "No se puede." }}
        recordId="removed"
      />,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(latest.open).toBe(true);
    expect(toastError).toHaveBeenCalledWith("No se puede.");
  });
});
