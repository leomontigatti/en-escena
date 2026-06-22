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

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useActionData: () => undefined,
    useFetcher: useFetcherMock,
    useNavigation: useNavigationMock,
    useSubmit: useSubmitMock,
  };
});

import { PortalBailarinDetalleRouteView } from "@/routes/portal.bailarines_.$dancerId";
import { PortalProfesoresRouteView } from "@/routes/portal.profesores";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

describe("portal simple form submissions", () => {
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
  });

  test("keeps the professor create dialog mounted and disables duplicate submits while saving", async () => {
    useFetcherMock.mockReturnValue({
      data: undefined,
      state: "submitting",
      submit: vi.fn(),
    });
    useNavigationMock.mockReturnValue({ formData: undefined, state: "idle" });
    useSubmitMock.mockReturnValue(vi.fn());

    await render(
      <MemoryRouter initialEntries={["/portal/profesores"]}>
        <PortalProfesoresRouteView loaderData={buildProfessorLoaderData()} />
      </MemoryRouter>,
    );

    await act(async () => {
      clickButton("Nuevo profesor");
    });

    expect(document.body.textContent).toContain("Nuevo profesor");
    const submitButton = getButton("Guardando...");

    expect(submitButton.disabled).toBe(true);
    expect(submitButton.querySelector("svg.animate-spin")).not.toBeNull();
  });

  test("disables the Bailarín save action while the edit submission is pending", async () => {
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
        <PortalBailarinDetalleRouteView
          loaderData={buildDancerDetailLoaderData()}
        />
      </MemoryRouter>,
    );

    const submitButton = getButton("Guardando...");

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

function buildProfessorLoaderData(): Parameters<
  typeof PortalProfesoresRouteView
>[0]["loaderData"] {
  return {
    professors: [],
  };
}

function buildDancerDetailLoaderData(): Parameters<
  typeof PortalBailarinDetalleRouteView
>[0]["loaderData"] {
  return {
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
