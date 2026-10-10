/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { JudgeFinalistPickRow } from "@/lib/grand-final/finalist-pick.server";
import { discardChangesTitle } from "@/lib/shared/discard-guard";
import {
  openRadixSelect,
  selectRadixOption,
} from "@/lib/test-support/radix-select";
import {
  createReactDomTestRenderer,
  updateReactDomForm,
  waitFor,
} from "@/lib/test-support/react-dom";

import type { FinalistPickActionData } from "./action.server";
import { FinalistPicks } from "./form";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const jazz: JudgeFinalistPickRow = {
  academyId: null,
  academyName: null,
  modalityId: "jazz",
  modalityName: "Danza Jazz",
  options: [
    { academyId: "pirueta", name: "Academia Pirueta" },
    { academyId: "vecina", name: "Academia Vecina" },
  ],
};

describe("the judge's `Gran final` picks", () => {
  const renderer = createReactDomTestRenderer();
  const submitted: FormData[] = [];

  beforeEach(() => {
    submitted.length = 0;
    toastError.mockClear();
  });

  afterEach(renderer.cleanup);

  async function mount(options: {
    answer?: FinalistPickActionData;
    isOpen: boolean;
    rows: JudgeFinalistPickRow[];
  }) {
    const router = createMemoryRouter(
      [
        {
          path: "/juzgamiento",
          action: async ({ request }) => {
            submitted.push(await request.formData());

            return (
              options.answer ?? {
                intent: "save-finalist-pick",
                message: "Guardaste la elección de finalista.",
                status: "success",
              }
            );
          },
          element: (
            <FinalistPicks isOpen={options.isOpen} rows={options.rows} />
          ),
        },
      ],
      { initialEntries: ["/juzgamiento"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    return router;
  }

  function saveButton() {
    return [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Guardar",
    );
  }

  async function pickAndSave(name: string) {
    await openRadixSelect(
      document.querySelector('[data-slot="select-trigger"]'),
    );
    await selectRadixOption(name);
    await updateReactDomForm(() => {
      saveButton()?.click();
    });
  }

  test("on the open day, posts the academy picked in the modality", async () => {
    await mount({ isOpen: true, rows: [jazz] });

    expect(saveButton()?.disabled).toBe(true);

    await pickAndSave("Academia Vecina");

    await waitFor(() => submitted.length === 1);
    expect(Object.fromEntries(submitted[0])).toEqual({
      academyId: "vecina",
      intent: "save-finalist-pick",
      modalityId: "jazz",
    });
  });

  test("tells the judge a refused pick in a toast", async () => {
    const message =
      "La jornada ya cerró, no se puede cambiar la elección de finalista.";

    await mount({
      answer: { intent: "save-finalist-pick", message, status: "error" },
      isOpen: true,
      rows: [jazz],
    });
    await pickAndSave("Academia Pirueta");

    await waitFor(() => toastError.mock.calls.length > 0);
    expect(toastError).toHaveBeenCalledWith(message, expect.anything());
  });

  test("on any other day, shows the pick with nothing to change it", async () => {
    await mount({
      isOpen: false,
      rows: [{ ...jazz, academyId: "vecina", academyName: "Academia Vecina" }],
    });

    expect(document.querySelector('[data-slot="select-trigger"]')).toBeNull();
    expect(saveButton()).toBeUndefined();
    expect(
      document.querySelector<HTMLInputElement>("input[disabled]")?.value,
    ).toBe("Academia Vecina");
  });

  test("keeps showing a saved pick whose academy stopped being eligible", async () => {
    await mount({
      isOpen: true,
      rows: [{ ...jazz, academyId: "ida", academyName: "Academia Ida" }],
    });

    expect(
      document.querySelector('[data-slot="select-trigger"]')?.textContent,
    ).toContain("Academia Ida");
    expect(saveButton()?.disabled).toBe(true);
  });

  test("asks before leaving the page with a pick chosen and not saved", async () => {
    const router = await mount({ isOpen: true, rows: [jazz] });

    await openRadixSelect(
      document.querySelector('[data-slot="select-trigger"]'),
    );
    await selectRadixOption("Academia Vecina");
    await updateReactDomForm(async () => {
      await router.navigate("/otra");
    });

    expect(router.state.location.pathname).toBe("/juzgamiento");
    expect(document.body.textContent).toContain(discardChangesTitle);
    expect(submitted).toHaveLength(0);
  });
});
