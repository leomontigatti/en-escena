/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { JudgePanelView } from "@/features/judging/list/view";
import type { JudgePresentationRow } from "@/lib/judging/judge-list.server";
import { discardChangesTitle } from "@/lib/shared/discard-guard";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

import {
  deleteFeedbackAudioTitle,
  playbackErrorMessage,
} from "./feedback-playback";
import { microphoneErrorMessage } from "./feedback-recorder";

/**
 * The browser APIs one take needs, none of which jsdom has. `stop` finishes the
 * take synchronously, which is all the recorder's own state machine asks for.
 */
function installRecorderStubs() {
  class FakeMediaRecorder {
    static isTypeSupported = () => true;
    mimeType = "audio/webm";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    state = "inactive";

    start() {
      this.state = "recording";
    }

    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["take"]) });
      this.onstop?.();
    }
  }

  const stubs = {
    AudioContext: class {
      close = () => Promise.resolve();
      createAnalyser = () => ({
        fftSize: 1024,
        getByteTimeDomainData: () => {},
      });
      createMediaStreamSource = () => ({ connect: () => {} });
    },
    MediaRecorder: FakeMediaRecorder,
  };

  for (const [name, value] of Object.entries(stubs)) {
    vi.stubGlobal(name, value);
  }

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: () => Promise.resolve({ getTracks: () => [] }) },
  });
}

function buildRow(feedbackAudioUrl: string | null): JudgePresentationRow {
  return {
    categoryAdmitsExperienceLevels: true,
    categoryName: "Juvenil",
    criteria: [],
    criteriaValues: {},
    experienceLevel: "amateur",
    feedbackAudioUrl,
    groupType: "solo",
    judgeAssignmentId: "assignment-a",
    modalityName: "Jazz",
    name: "Primera",
    orderNumber: 1,
    presentationId: "a",
    status: "pending",
    submodalityName: "Lyrical",
    value: null,
  };
}

describe("recording a `Devolución` with the score", () => {
  const renderer = createReactDomTestRenderer();
  const submitted: FormData[] = [];

  const revoked: string[] = [];

  beforeEach(() => {
    window.sessionStorage.clear();
    submitted.length = 0;
    revoked.length = 0;
    let created = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      () => `blob:take-${++created}`,
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
      revoked.push(url);
    });
  });

  afterEach(() => {
    renderer.cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

  /** Records one take and stops it, on the stubs jsdom needs to have any. */
  async function recordATake() {
    await clickReactDomButton("Empezar a grabar");
    await clickReactDomButton("Terminar grabación");
  }

  test("frees the take it recorded when the judge deletes it", async () => {
    installRecorderStubs();
    await mount();

    await recordATake();

    expect(revoked).toEqual([]);

    await clickReactDomButton("Eliminar grabación");
    await answerDeleteConfirmation("Eliminar");

    expect(revoked).toEqual(["blob:take-1"]);
  });

  test("frees the take it recorded when the form goes away", async () => {
    installRecorderStubs();
    await mount();

    await recordATake();
    renderer.cleanup();

    expect(revoked).toEqual(["blob:take-1"]);
  });

  test("never frees the stored take, which is the server's", async () => {
    await mount("https://audio/stored");

    await clickReactDomButton("Eliminar grabación");
    await answerDeleteConfirmation("Eliminar");

    expect(revoked).toEqual([]);
  });

  test("says so when the take cannot be played", async () => {
    const errors: string[] = [];
    vi.spyOn(toast, "error").mockImplementation((message) => {
      errors.push(String(message));

      return "";
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      new Error("NotAllowedError"),
    );

    await mount("https://audio/stored");

    await clickReactDomButton("Escuchar");

    expect(errors).toEqual([playbackErrorMessage]);
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
