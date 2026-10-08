/** @vitest-environment jsdom */

import { act } from "react";
import { toast } from "sonner";
import {
  createMemoryRouter,
  RouterProvider,
  useActionData,
} from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  createReactDomTestRenderer,
  findButton,
  updateReactDomForm,
  waitFor,
} from "@/lib/test-support/react-dom";

import type {
  FinalistBannersActionData,
  FinalistBannersLoaderData,
} from "./shared";
import { FinalistBannersView } from "./view";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const loaderData: FinalistBannersLoaderData = {
  academyId: "vecina",
  academyName: "Academia Vecina",
  bannerUrls: {
    first: "/almacenamiento?key=1",
    second: "/almacenamiento?key=2",
  },
  selectedEventId: "evento",
  values: {
    firstBannerStorageKey: "events/evento/grand-final/vecina/first-1.png",
    secondBannerStorageKey: "events/evento/grand-final/vecina/second-1.png",
  },
};

/** The view as the route renders it, with the action's latest answer. */
function RoutedView() {
  const actionData = useActionData<FinalistBannersActionData>();

  return (
    <FinalistBannersView actionData={actionData} loaderData={loaderData} />
  );
}

describe("the finalist banner form", () => {
  const renderer = createReactDomTestRenderer();
  const submitted: FormData[] = [];

  beforeEach(() => {
    submitted.length = 0;
  });

  afterEach(renderer.cleanup);

  async function mount(
    answer: FinalistBannersActionData = {
      message: "Guardaste los banners.",
      status: "success",
    },
  ) {
    const path = "/administracion/gran-final/vecina";
    const router = createMemoryRouter(
      [
        {
          path,
          action: async ({ request }): Promise<FinalistBannersActionData> => {
            submitted.push(await request.formData());

            return answer;
          },
          element: <RoutedView />,
        },
      ],
      { initialEntries: [path] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  const saveButton = () => findButton("Guardar", { exact: true });

  test("removes one banner and keeps the other's stored key", async () => {
    await mount();

    const [removeFirst] = document.querySelectorAll<HTMLButtonElement>(
      'button[data-variant="destructive"]',
    );
    await updateReactDomForm(() => {
      removeFirst.click();
    });

    expect(saveButton()?.disabled).toBe(false);

    await updateReactDomForm(() => {
      saveButton()?.click();
    });
    await waitFor(() => submitted.length === 1);

    expect(submitted[0].get("intent")).toBe("save-finalist-banners");
    expect(submitted[0].get("firstBannerStorageKey")).toBe("");
    expect(submitted[0].get("secondBannerStorageKey")).toBe(
      loaderData.values.secondBannerStorageKey,
    );
  });

  test("counts a picked picture as a change", async () => {
    await mount();

    const input = document.querySelector<HTMLInputElement>(
      'input[name="secondBanner"]',
    );

    if (!input) {
      throw new Error("Expected the second banner's file input");
    }

    await act(async () => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File(["png"], "nuevo.png", { type: "image/png" })],
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(saveButton()?.disabled).toBe(false);
  });

  test("tells the user why the server refused a picture", async () => {
    const refusal =
      "El Banner 2 tiene que ser horizontal 16:9, como 1920 × 1080; el elegido mide 1600 × 1600.";
    await mount({ message: refusal, status: "error" });

    const [removeFirst] = document.querySelectorAll<HTMLButtonElement>(
      'button[data-variant="destructive"]',
    );
    await updateReactDomForm(() => {
      removeFirst.click();
    });
    await updateReactDomForm(() => {
      saveButton()?.click();
    });

    await waitFor(() => vi.mocked(toast.error).mock.calls.length > 0);
    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe(refusal);
    expect(saveButton()?.disabled).toBe(false);
  });
});
