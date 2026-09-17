import { describe, expect, test } from "vitest";

import {
  deletePaymentIntent,
  shouldOpenPaymentDeleteDialog,
  updatePaymentIntent,
} from "./shared";

const unexpectedError = {
  status: "error",
  message: "No pudimos completar la acción. Intentá nuevamente.",
} as const;

describe("shouldOpenPaymentDeleteDialog", () => {
  test("stays closed with no result", () => {
    expect(
      shouldOpenPaymentDeleteDialog({
        actionData: undefined,
        submittedIntent: null,
      }),
    ).toBe(false);
  });

  test("re-opens on a result of the delete intent", () => {
    expect(
      shouldOpenPaymentDeleteDialog({
        actionData: { intent: deletePaymentIntent },
        submittedIntent: deletePaymentIntent,
      }),
    ).toBe(true);
  });

  test("stays closed on a result of the update intent", () => {
    expect(
      shouldOpenPaymentDeleteDialog({
        actionData: { intent: updatePaymentIntent },
        submittedIntent: updatePaymentIntent,
      }),
    ).toBe(false);
  });

  // The dialog the failure came from is the one that has to come back: closing
  // it would drop the confirmation the admin had already reached.
  test("re-opens on an unexpected failure of the delete form", () => {
    expect(
      shouldOpenPaymentDeleteDialog({
        actionData: unexpectedError,
        submittedIntent: deletePaymentIntent,
      }),
    ).toBe(true);
  });

  test("stays closed on an unexpected failure of the update form", () => {
    expect(
      shouldOpenPaymentDeleteDialog({
        actionData: unexpectedError,
        submittedIntent: updatePaymentIntent,
      }),
    ).toBe(false);
  });

  test("stays closed on an unexpected failure with nothing in flight", () => {
    expect(
      shouldOpenPaymentDeleteDialog({
        actionData: unexpectedError,
        submittedIntent: null,
      }),
    ).toBe(false);
  });
});
