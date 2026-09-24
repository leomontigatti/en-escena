/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { JudgePanelView } from "@/features/judging/list/view";
import type { JudgePresentationRow } from "@/lib/judging/judge-list.server";
import { scoreValueMessage } from "@/lib/judging/score-value";
import { discardChangesTitle } from "@/lib/shared/discard-guard";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

import type { JudgePanelActionData } from "./action.server";

function buildRow(
  overrides: Partial<JudgePresentationRow> & { presentationId: string },
): JudgePresentationRow {
  return {
    categoryAdmitsExperienceLevels: true,
    categoryName: "Juvenil",
    criteria: [],
    experienceLevel: "amateur",
    feedbackAudioUrl: null,
    groupType: "solo",
    judgeAssignmentId: `assignment-${overrides.presentationId}`,
    modalityName: "Jazz",
    name: `Coreografía ${overrides.presentationId}`,
    orderNumber: 1,
    status: "pendiente",
    submodalityName: "Lyrical",
    ...overrides,
    presentationId: overrides.presentationId,
  };
}

const presentations = [
  buildRow({
    name: "Primera",
    orderNumber: 1,
    presentationId: "a",
    status: "sinDevolucion",
  }),
  buildRow({ name: "Segunda", orderNumber: 2, presentationId: "b" }),
  buildRow({ name: "Tercera", orderNumber: 3, presentationId: "c" }),
];

describe("scoring a presentation without criteria", () => {
  const renderer = createReactDomTestRenderer();

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(renderer.cleanup);

  const submitted: FormData[] = [];

  beforeEach(() => {
    submitted.length = 0;
  });

  async function mount(options: {
    actionData?: JudgePanelActionData;
    presentationId: string;
    rows?: JudgePresentationRow[];
  }) {
    const router = createMemoryRouter(
      [
        {
          path: "/juzgamiento",
          action: async ({ request }) => {
            submitted.push(await request.formData());

            return { message: "Guardaste el puntaje.", status: "success" };
          },
          element: (
            <JudgePanelView
              actionData={options.actionData}
              loaderData={{
                account: {
                  name: "Ana Juez",
                  roleLabel: "Jurado",
                  username: "ana.juez",
                },
                presentations: options.rows ?? presentations,
              }}
            />
          ),
        },
      ],
      {
        initialEntries: [`/juzgamiento?presentacion=${options.presentationId}`],
      },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    return router;
  }

  function scoreInput() {
    return document.querySelector<HTMLInputElement>("#judge-score-value");
  }

  function errorMessages() {
    return [...document.querySelectorAll("[data-slot='field-error']")].map(
      (node) => node.textContent,
    );
  }

  function saveButton() {
    return document.querySelector<HTMLButtonElement>(
      "button[form='judge-score-form']",
    );
  }

  test("opens the dialog for the presentation in the URL", async () => {
    await mount({ presentationId: "b" });

    expect(document.body.textContent).toContain("Segunda");
    expect(scoreInput()).not.toBeNull();
  });

  test("errors on an empty score only once the judge saves", async () => {
    await mount({ presentationId: "b" });

    expect(errorMessages()).toEqual([]);

    await updateReactDomForm(() => {
      saveButton()?.click();
    });

    expect(errorMessages()).toEqual([scoreValueMessage()]);
  });

  test("errors on a value that is not a half step, and clears it once it is", async () => {
    await mount({ presentationId: "b" });
    const input = scoreInput();

    await updateReactDomForm(() => {
      if (input) {
        setInputValue(input, "90.2");
      }
    });

    expect(errorMessages()).toEqual([]);

    await updateReactDomForm(() => {
      saveButton()?.click();
    });

    expect(errorMessages()).toEqual([scoreValueMessage()]);

    await updateReactDomForm(() => {
      if (input) {
        setInputValue(input, "90.5");
      }
    });

    expect(errorMessages()).toEqual([]);
  });

  test("posts the score with the save intent, the presentation and what to do with the take", async () => {
    await mount({ presentationId: "b" });
    const input = scoreInput();

    await updateReactDomForm(() => {
      if (input) {
        setInputValue(input, "90.5");
      }
    });

    await updateReactDomForm(() => {
      saveButton()?.click();
    });

    expect(submitted.map((body) => Object.fromEntries(body))).toEqual([
      {
        audioIntent: "keep",
        intent: "save-score",
        presentationId: "b",
        value: "90.5",
      },
    ]);
  });

  test("opens the next pending presentation once the score is saved", async () => {
    const router = await mount({
      actionData: { message: "Guardaste el puntaje.", status: "success" },
      presentationId: "b",
    });

    expect(router.state.location.search).toBe("?presentacion=c");
    expect(document.body.textContent).toContain("Tercera");
  });

  test("closes the form when the judge has nothing left to score", async () => {
    const router = await mount({
      actionData: { message: "Guardaste el puntaje.", status: "success" },
      presentationId: "b",
      rows: presentations.map((row) => ({ ...row, status: "sinDevolucion" })),
    });

    expect(router.state.location.search).toBe("");
    expect(scoreInput()).toBeNull();
  });

  test("never closes on a tap outside the dialog", async () => {
    const router = await mount({ presentationId: "b" });

    await updateReactDomForm(() => {
      document.body.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true }),
      );
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(router.state.location.search).toBe("?presentacion=b");
    expect(scoreInput()).not.toBeNull();
  });

  test("closes a clean form without asking", async () => {
    const router = await mount({ presentationId: "b" });

    await clickReactDomButton("Cancelar");

    expect(document.body.textContent).not.toContain(discardChangesTitle);
    expect(router.state.location.search).toBe("");
    expect(scoreInput()).toBeNull();
  });

  test("asks before throwing away a score that was typed", async () => {
    const router = await mount({ presentationId: "b" });
    const input = scoreInput();

    await updateReactDomForm(() => {
      if (input) {
        setInputValue(input, "90.5");
      }
    });

    await clickReactDomButton("Cancelar");

    expect(document.body.textContent).toContain(discardChangesTitle);
    expect(router.state.location.search).toBe("?presentacion=b");

    await clickReactDomButton("Seguir editando");

    expect(document.body.textContent).not.toContain(discardChangesTitle);
    expect(scoreInput()?.value).toBe("90.5");

    await clickReactDomButton("Cancelar");
    await clickReactDomButton("Descartar");

    expect(router.state.location.search).toBe("");
    expect(scoreInput()).toBeNull();
  });

  test("asks when Esc closes a dirty form", async () => {
    const router = await mount({ presentationId: "b" });
    const input = scoreInput();

    await updateReactDomForm(() => {
      if (input) {
        setInputValue(input, "90.5");
      }
    });

    await updateReactDomForm(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });

    expect(document.body.textContent).toContain(discardChangesTitle);
    expect(router.state.location.search).toBe("?presentacion=b");
  });
});
