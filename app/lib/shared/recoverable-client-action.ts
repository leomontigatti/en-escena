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

export { type UnexpectedActionError, recoverableClientAction };
