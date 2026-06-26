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

import { PortalDancerDetailRouteView } from "@/features/portal/dancers/detail/view";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

describe("dancer detail submissions", () => {
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

  test("disables the save action while the edit submission is pending", async () => {
    const formData = new FormData();
    formData.set("intent", "update-dancer");

    useFetcherMock.mockReturnValue({
      data: undefined,
      state: "idle",
      submit: vi.fn(),
    });
    useNavigationMock.mockReturnValue({
      formData,
      state: "submitting",
    });
    useSubmitMock.mockReturnValue(vi.fn());

    await render(
      <MemoryRouter initialEntries={["/portal/bailarines/dancer_1"]}>
        <PortalDancerDetailRouteView
          loaderData={buildDancerDetailLoaderData()}
        />
      </MemoryRouter>,
    );

    const submitButton = getButton("Guardar");

    expect(submitButton.disabled).toBe(true);
    expect(submitButton.querySelector("svg.animate-spin")).not.toBeNull();
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

function buildDancerDetailLoaderData(): Parameters<
  typeof PortalDancerDetailRouteView
>[0]["loaderData"] {
  return {
    documentImageUrls: {
      back: null,
      front: null,
    },
    dancer: {
      id: "dancer_1",
      academyId: "academy_1",
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2014-01-01",
      documentType: null,
      documentNumber: null,
      documentFrontImageStorageKey: null,
      documentBackImageStorageKey: null,
      identityVerifiedAt: null,
      active: true,
      createdAt: new Date("2026-01-01T12:00:00Z"),
      updatedAt: new Date("2026-01-02T12:00:00Z"),
    },
  };
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
