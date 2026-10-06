/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  useRosterRefusalToast,
  type RosterDocumentConflict,
} from "@/components/shared/roster-document-conflict";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

type ToastOptions = {
  action?: { label: string; onClick: () => void };
  id?: string;
};

const toastError = vi.hoisted(() =>
  vi.fn<(message: string, options?: ToastOptions) => void>(),
);

vi.mock("sonner", () => ({
  toast: { error: toastError },
}));

describe("useRosterRefusalToast", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    toastError.mockReset();
  });

  function Form({
    conflict,
    refusal,
  }: {
    conflict: RosterDocumentConflict;
    refusal: { message: string } | null;
  }) {
    useRosterRefusalToast({ conflict, refusal, toastId: "roster:error" });

    return <p>Formulario</p>;
  }

  async function mount(
    conflict: RosterDocumentConflict,
    refusal: { message: string } | null,
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/bailarines/nuevo",
          element: <Form conflict={conflict} refusal={refusal} />,
        },
        { path: "/bailarines/:dancerId", element: <p>Ficha encontrada</p> },
      ],
      { initialEntries: ["/bailarines/nuevo"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  test("says which document is taken and links to the person holding it", async () => {
    await mount(
      {
        matchHref: "/bailarines/dancer_archived_1",
        message: "Ya existe un bailarín archivado con ese documento.",
      },
      { message: "Revisá los datos del Bailarín." },
    );

    expect(toastError).toHaveBeenCalledTimes(1);

    const [message, options] = toastError.mock.calls[0]!;

    expect(message).toBe("Ya existe un bailarín archivado con ese documento.");
    expect(options?.id).toBe("roster:error");
    expect(options?.action?.label).toBe("Ver ficha");

    await act(async () => {
      options?.action?.onClick();
    });

    expect(document.body.textContent).toBe("Ficha encontrada");
  });

  test("toasts any other refusal as it came, with nothing to follow", async () => {
    await mount({}, { message: "No pudimos guardar el bailarín." });

    expect(toastError).toHaveBeenCalledWith("No pudimos guardar el bailarín.", {
      action: undefined,
      id: "roster:error",
    });
  });

  // A re-render of the same answer stays quiet; a second refusal is a new
  // answer, and says so again even when it reads the same.
  test("toasts once per answer, and again for a new identical one", async () => {
    let answer: (refusal: { message: string }) => void = () => {};
    let rerender: () => void = () => {};

    function Answering() {
      const [refusal, setRefusal] = useState({ message: "No se pudo." });
      const [, setCount] = useState(0);
      answer = setRefusal;
      rerender = () => setCount((count) => count + 1);

      return <Form conflict={{}} refusal={refusal} />;
    }

    const router = createMemoryRouter([{ path: "/", element: <Answering /> }]);
    const tick = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

    await renderer.renderAsync(<RouterProvider router={router} />);
    await tick();
    expect(toastError).toHaveBeenCalledTimes(1);

    await act(async () => rerender());
    await tick();
    expect(toastError).toHaveBeenCalledTimes(1);

    await act(async () => answer({ message: "No se pudo." }));
    await tick();
    expect(toastError).toHaveBeenCalledTimes(2);
  });

  test("says nothing without a refusal", async () => {
    await mount({}, null);

    expect(toastError).not.toHaveBeenCalled();
  });
});
