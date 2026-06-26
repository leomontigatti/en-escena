/** @vitest-environment jsdom */

import "@/test/react-test-env";

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

const useFetcherMock = vi.hoisted(() => vi.fn());
const useNavigationMock = vi.hoisted(() => vi.fn());
const useSubmitMock = vi.hoisted(() => vi.fn());
const useViewTransitionStateMock = vi.hoisted(() =>
  vi.fn((_: string) => false),
);

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useActionData: () => undefined,
    useFetcher: useFetcherMock,
    useNavigation: useNavigationMock,
    useSubmit: useSubmitMock,
    useViewTransitionState: useViewTransitionStateMock,
  };
});

import { PortalDancersListRouteView } from "@/features/portal/dancers/list/view";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

type FetcherState = {
  data: undefined;
  state: "idle" | "submitting";
  submit: ReturnType<typeof vi.fn>;
};

describe("dancer create submissions", () => {
  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }

    container?.remove();
    container = null;
    document.body.innerHTML = "";
    useFetcherMock.mockReset();
    useNavigationMock.mockReset();
    useSubmitMock.mockReset();
    useViewTransitionStateMock.mockReset();
    useViewTransitionStateMock.mockReturnValue(false);
  });

  test("closes the create dialog after a successful fetcher submission", async () => {
    let fetcherState: FetcherState = {
      data: undefined,
      state: "submitting",
      submit: vi.fn(),
    };

    useFetcherMock.mockImplementation(() => fetcherState);
    useNavigationMock.mockReturnValue({ formData: undefined, state: "idle" });
    useSubmitMock.mockReturnValue(vi.fn());

    const buildElement = () => (
      <MemoryRouter initialEntries={["/portal/bailarines"]}>
        <PortalDancersListRouteView loaderData={{ dancers: [] }} />
      </MemoryRouter>
    );

    await render(buildElement());

    await act(async () => {
      clickButton("Nuevo bailarín");
    });

    expect(document.body.textContent).toContain("Nuevo bailarín");

    fetcherState = {
      data: undefined,
      state: "idle",
      submit: fetcherState.submit,
    };

    await act(async () => {
      root?.render(buildElement());
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

async function render(element: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(element);
  });
}

function clickButton(label: string) {
  getButton(label).click();
}

function getButton(label: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(label),
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button "${label}" to be rendered.`);
  }

  return button;
}
