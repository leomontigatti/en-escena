import { isRouteErrorResponse } from "react-router";

type UnexpectedActionError = {
  status: "error";
  message: string;
};

const unexpectedActionError: UnexpectedActionError = {
  status: "error",
  message: "No pudimos completar la acción. Intentá nuevamente.",
};

/**
 * Reads a result as the generic failure `recoverableClientAction` returns.
 *
 * For a view whose own result is a closed union that already has a `status`,
 * plain narrowing (`data?.status === "error"`) is exact and this adds nothing.
 * This is for the other case: a result tagged some other way — an intent, an
 * `ok` flag — where telling the two apart needs a structural test, and the
 * obvious `"status" in data` would also swallow any later result shape that
 * happens to carry a `status` of its own.
 */
function isUnexpectedActionError(data: unknown): data is UnexpectedActionError {
  return (
    typeof data === "object" &&
    data !== null &&
    "status" in data &&
    data.status === "error" &&
    "message" in data &&
    typeof data.message === "string"
  );
}

/**
 * Wraps a route's `serverAction` so an unexpected failure becomes a returned
 * error result instead of an error the router routes to the boundary, which
 * would unmount the open dialog or form together with the typed values.
 *
 * Deliberate refusals still reach the boundary: a thrown `Response` (a redirect,
 * or a 403/404/400) is rethrown untouched.
 */
async function recoverableClientAction<Result>(
  serverAction: () => Promise<Result>,
): Promise<Result | UnexpectedActionError> {
  try {
    return await serverAction();
  } catch (error) {
    if (error instanceof Response || isRouteErrorResponse(error)) {
      throw error;
    }

    console.error("[action:unexpected]", error);

    return unexpectedActionError;
  }
}

export {
  type UnexpectedActionError,
  isUnexpectedActionError,
  recoverableClientAction,
};
