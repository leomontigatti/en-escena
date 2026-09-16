import { redirect } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { recoverableClientAction } from "./recoverable-client-action";

describe("recoverableClientAction", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns the server action result unchanged on success", async () => {
    const result = { status: "success", message: "Pago registrado." };

    await expect(recoverableClientAction(async () => result)).resolves.toBe(
      result,
    );
    expect(console.error).not.toHaveBeenCalled();
  });

  test("turns a thrown error into a generic error result", async () => {
    const failure = new Error("connection terminated unexpectedly");

    await expect(
      recoverableClientAction(async () => {
        throw failure;
      }),
    ).resolves.toEqual({
      status: "error",
      message: "No pudimos completar la acción. Intentá nuevamente.",
    });
    expect(console.error).toHaveBeenCalledWith("[action:unexpected]", failure);
  });

  test("turns a network failure into a generic error result", async () => {
    const failure = new TypeError("Failed to fetch");

    await expect(
      recoverableClientAction(async () => {
        throw failure;
      }),
    ).resolves.toEqual({
      status: "error",
      message: "No pudimos completar la acción. Intentá nuevamente.",
    });
    expect(console.error).toHaveBeenCalledWith("[action:unexpected]", failure);
  });

  test("rethrows a redirect so the navigation still happens", async () => {
    const redirectResponse = redirect("/ingresar");

    await expect(
      recoverableClientAction(async () => {
        throw redirectResponse;
      }),
    ).rejects.toBe(redirectResponse);
    expect(console.error).not.toHaveBeenCalled();
  });

  test.each([403, 404])(
    "rethrows a thrown %i response so the boundary renders",
    async (status) => {
      const thrownResponse = new Response("No autorizado.", { status });

      await expect(
        recoverableClientAction(async () => {
          throw thrownResponse;
        }),
      ).rejects.toBe(thrownResponse);
      expect(console.error).not.toHaveBeenCalled();
    },
  );

  test("rethrows a route error response", async () => {
    const routeErrorResponse = {
      status: 404,
      statusText: "Not Found",
      internal: false,
      data: "No encontrado.",
    };

    await expect(
      recoverableClientAction(async () => {
        throw routeErrorResponse;
      }),
    ).rejects.toBe(routeErrorResponse);
    expect(console.error).not.toHaveBeenCalled();
  });
});
