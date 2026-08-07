/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createMemoryRouter, RouterProvider, useSubmit } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { useSavedValueSelectForm } from "@/features/admin/choreographies/detail/use-saved-value-select-form";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

const fieldName = "assignedScheduleCapacityId";

describe("useSavedValueSelectForm", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("returns the saved value from the loader on the first render", async () => {
    await renderHarness();

    expect(readFieldValue()).toBe("schedule_capacity_1");
  });

  test("keeps the picked value while the submission is in flight", async () => {
    await renderHarness({ action: () => new Promise(() => {}) });

    await clickReactDomButton("Elegir otro");

    expect(readFieldValue()).toBe("schedule_capacity_2");
  });

  test("restores the saved value once a rejected submission settles", async () => {
    // El rechazo no escribió nada, así que el loader sigue trayendo el cupo
    // viejo: el campo no puede quedarse mostrando el que el servidor negó.
    await renderHarness();

    await clickReactDomButton("Elegir otro");
    await settle();

    expect(readFieldValue()).toBe("schedule_capacity_1");
  });

  test("follows the loader, not the local pick, once the submission settles", async () => {
    // El loader manda: si vuelve con un cupo distinto del elegido (lo reasignó
    // otro camino, o el servidor normalizó el destino), el campo lo adopta.
    await renderHarness();

    await clickReactDomButton("Elegir otro");
    await clickReactDomButton("Revalidar");
    await settle();

    expect(readFieldValue()).toBe("schedule_capacity_3");
  });

  async function renderHarness(
    input: { action?: () => Promise<unknown> } = {},
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/detalle",
          action: input.action ?? (async () => null),
          element: <Harness />,
        },
      ],
      { initialEntries: ["/detalle"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }
});

/**
 * `savedValue` vive en estado para poder mover el loader sin desmontar: un
 * remount recuperaría el valor guardado por `defaultValues` y taparía
 * justamente lo que se está probando.
 */
function Harness() {
  const [savedValue, setSavedValue] = useState("schedule_capacity_1");
  const form = useSavedValueSelectForm(fieldName, savedValue);
  const submit = useSubmit();

  return (
    <>
      <span data-testid="field-value">{form.watch(fieldName)}</span>
      <button
        type="button"
        onClick={() => {
          form.setValue(fieldName, "schedule_capacity_2");

          const formData = new FormData();
          formData.set(fieldName, "schedule_capacity_2");
          void submit(formData, { method: "post" });
        }}
      >
        Elegir otro
      </button>
      <button
        type="button"
        onClick={() => setSavedValue("schedule_capacity_3")}
      >
        Revalidar
      </button>
    </>
  );
}

function readFieldValue() {
  return document.querySelector('[data-testid="field-value"]')?.textContent;
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
