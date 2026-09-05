/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createMemoryRouter, RouterProvider, useSubmit } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { useSavedValueSelectForm } from "@/features/admin/choreographies/detail/use-saved-value-select-form";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

const fieldName = "assignedExperienceLevelId";

describe("useSavedValueSelectForm", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("returns the saved value from the loader on the first render", async () => {
    await renderHarness();

    expect(readFieldValue()).toBe("experience_level_1");
  });

  test("keeps the picked value while the submission is in flight", async () => {
    await renderHarness({ action: () => new Promise(() => {}) });

    await clickReactDomButton("Elegir otro");

    expect(readFieldValue()).toBe("experience_level_2");
  });

  test("restores the saved value once a rejected submission settles", async () => {
    // The rejection wrote nothing, so the loader still brings the old level: the
    // field cannot be left showing the one the server refused.
    await renderHarness();

    await clickReactDomButton("Elegir otro");
    await settle();

    expect(readFieldValue()).toBe("experience_level_1");
  });

  test("follows the loader, not the local pick, once the submission settles", async () => {
    // The loader rules: if it comes back with a level other than the chosen one
    // (another path reassigned it, or the server normalized the destination), the
    // field adopts it.
    await renderHarness();

    await clickReactDomButton("Elegir otro");
    await clickReactDomButton("Revalidar");
    await settle();

    expect(readFieldValue()).toBe("experience_level_3");
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
 * `savedValue` lives in state so the loader can be moved without unmounting: a
 * remount would restore the saved value through `defaultValues` and cover up
 * exactly what is being tested.
 */
function Harness() {
  const [savedValue, setSavedValue] = useState("experience_level_1");
  const form = useSavedValueSelectForm(fieldName, savedValue);
  const submit = useSubmit();

  return (
    <>
      <span data-testid="field-value">{form.watch(fieldName)}</span>
      <button
        type="button"
        onClick={() => {
          form.setValue(fieldName, "experience_level_2");

          const formData = new FormData();
          formData.set(fieldName, "experience_level_2");
          void submit(formData, { method: "post" });
        }}
      >
        Elegir otro
      </button>
      <button type="button" onClick={() => setSavedValue("experience_level_3")}>
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
