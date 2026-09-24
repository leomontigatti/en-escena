/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { JudgePanelView } from "@/features/judging/list/view";
import type { JudgePresentationRow } from "@/lib/judging/judge-list.server";
import { discardChangesTitle } from "@/lib/shared/discard-guard";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

import { deleteFeedbackAudioTitle } from "./feedback-playback";
import { microphoneErrorMessage } from "./feedback-recorder";

function buildRow(feedbackAudioUrl: string | null): JudgePresentationRow {
  return {
    categoryAdmitsExperienceLevels: true,
    categoryName: "Juvenil",
    criteria: [],
    experienceLevel: "amateur",
    feedbackAudioUrl,
    groupType: "solo",
    judgeAssignmentId: "assignment-a",
    modalityName: "Jazz",
    name: "Primera",
    orderNumber: 1,
    presentationId: "a",
    status: "pendiente",
    submodalityName: "Lyrical",
  };
}

describe("recording a `Devolución` with the score", () => {
  const renderer = createReactDomTestRenderer();
  const submitted: FormData[] = [];

  beforeEach(() => {
    window.sessionStorage.clear();
    submitted.length = 0;
  });

  afterEach(renderer.cleanup);

  async function mount(feedbackAudioUrl: string | null = null) {
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
              loaderData={{
                account: {
                  name: "Ana Juez",
                  roleLabel: "Jurado",
                  username: "ana.juez",
                },
                presentations: [buildRow(feedbackAudioUrl)],
              }}
            />
          ),
        },
      ],
      { initialEntries: ["/juzgamiento?presentacion=a"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    return router;
  }

  /**
   * The form's own `Cancelar` and the confirmation's read the same, so the
   * confirmation is answered inside its own dialog.
   */
  async function answerDeleteConfirmation(label: string) {
    const button = [
      ...document.querySelectorAll<HTMLButtonElement>(
        "[role='alertdialog'] button",
      ),
    ].find((candidate) => candidate.textContent?.trim() === label);

    if (!button) {
      throw new Error(`Expected "${label}" in the confirmation.`);
    }

    await updateReactDomForm(() => button.click());
  }

  async function saveScore() {
    const input =
      document.querySelector<HTMLInputElement>("#judge-score-value");

    await updateReactDomForm(() => {
      if (input) {
        setInputValue(input, "90.5");
      }
    });

    await updateReactDomForm(() => {
      document
        .querySelector<HTMLButtonElement>("button[form='judge-score-form']")
        ?.click();
    });
  }

  test("says to check the browser permission when the mic cannot be used", async () => {
    await mount();

    expect(document.body.textContent).not.toContain(microphoneErrorMessage);

    await clickReactDomButton("Empezar a grabar");

    expect(document.body.textContent).toContain(microphoneErrorMessage);
  });

  test("keeps the stored take when the judge only changes the score", async () => {
    await mount("https://audio/stored");

    await saveScore();

    expect(submitted.map((body) => Object.fromEntries(body))).toEqual([
      {
        audioIntent: "keep",
        intent: "save-score",
        presentationId: "a",
        value: "90.5",
      },
    ]);
  });

  test("asks before deleting a take, and posts the removal with the score", async () => {
    await mount("https://audio/stored");

    await clickReactDomButton("Eliminar grabación");

    expect(document.body.textContent).toContain(deleteFeedbackAudioTitle);

    await answerDeleteConfirmation("Cancelar");

    expect(document.body.textContent).not.toContain(deleteFeedbackAudioTitle);

    await clickReactDomButton("Eliminar grabación");
    await answerDeleteConfirmation("Eliminar");

    await saveScore();

    expect(submitted.map((body) => body.get("audioIntent"))).toEqual([
      "remove",
    ]);
  });

  test("asks before closing a form whose take was deleted", async () => {
    const router = await mount("https://audio/stored");

    await clickReactDomButton("Eliminar grabación");
    await answerDeleteConfirmation("Eliminar");

    await clickReactDomButton("Cancelar", { exact: true });

    expect(document.body.textContent).toContain(discardChangesTitle);
    expect(router.state.location.search).toBe("?presentacion=a");
  });
});
