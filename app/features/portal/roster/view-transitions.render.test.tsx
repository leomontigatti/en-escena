/** @vitest-environment jsdom */

import "@/test/react-test-env";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

const useViewTransitionStateMock = vi.hoisted(() =>
  vi.fn((_: string) => false),
);

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useViewTransitionState: useViewTransitionStateMock,
  };
});

import { PortalDancerDetailRouteView } from "@/features/portal/dancers/detail/view";
import { PortalDancersListRouteView } from "@/features/portal/dancers/list/view";
import { PortalProfessorDetailRouteView } from "@/features/portal/professors/detail/view";
import { PortalProfessorsListRouteView } from "@/features/portal/professors/list/view";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

describe("portal view transitions", () => {
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
    useViewTransitionStateMock.mockReset();
    useViewTransitionStateMock.mockReturnValue(false);
  });

  test("scopes list-detail transitions to bailarines and profesores record names", async () => {
    useViewTransitionStateMock.mockImplementation(
      (href: string) =>
        href === "/portal/bailarines/dancer_1" ||
        href === "/portal/profesores/professor_1",
    );

    await renderRoute(
      "/portal/bailarines",
      <PortalDancersListRouteView
        loaderData={{
          dancers: [
            {
              id: "dancer_1",
              firstName: "Ana",
              lastName: "Paz",
              active: true,
              birthDate: "2015-01-01",
              documentType: null,
              documentNumber: null,
              verificationStatus: "incomplete",
              participationStatus: "not-participating",
            },
          ],
        }}
      />,
    );

    const dancerLink = document.querySelector(
      'a[href="/portal/bailarines/dancer_1"]',
    );
    expect(dancerLink?.getAttribute("style")).toContain(
      "view-transition-name: portal-record-title",
    );

    await renderRoute(
      "/portal/bailarines/dancer_1",
      <PortalDancerDetailRouteView
        loaderData={buildDancerDetailLoaderData()}
      />,
    );

    expect(document.getElementById("bailarin-detail-title")?.textContent).toBe(
      "Ana Paz",
    );
    expect(
      document.getElementById("bailarin-detail-title")?.getAttribute("style"),
    ).toContain("view-transition-name: portal-record-title");

    await renderRoute(
      "/portal/profesores",
      <PortalProfessorsListRouteView
        loaderData={{
          professors: [
            {
              id: "professor_1",
              firstName: "Luz",
              lastName: "Suárez",
              active: true,
              documentType: null,
              documentNumber: null,
              isIncomplete: true,
              participationStatus: "not-participating",
            },
          ],
        }}
      />,
    );

    const professorLink = document.querySelector(
      'a[href="/portal/profesores/professor_1"]',
    );
    expect(professorLink?.getAttribute("style")).toContain(
      "view-transition-name: portal-record-title",
    );

    await renderRoute(
      "/portal/profesores/professor_1",
      <PortalProfessorDetailRouteView
        loaderData={buildProfessorDetailLoaderData()}
      />,
    );

    expect(document.getElementById("profesor-detail-title")?.textContent).toBe(
      "Luz Suárez",
    );
    expect(
      document.getElementById("profesor-detail-title")?.getAttribute("style"),
    ).toContain("view-transition-name: portal-record-title");
  });
});

async function renderRoute(path: string, element: React.ReactNode) {
  if (!container) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const router = createMemoryRouter(
    [
      {
        path,
        action: async () => null,
        element,
      },
    ],
    { initialEntries: [path] },
  );

  await act(async () => {
    root?.render(<RouterProvider router={router} />);
  });
}

function buildDancerDetailLoaderData() {
  return {
    documentImageUrls: {
      back: null,
      front: null,
    },
    dancer: {
      id: "dancer_1",
      firstName: "Ana",
      lastName: "Paz",
      active: true,
      birthDate: "2015-01-01",
      documentType: null,
      documentNumber: null,
      documentFrontImageStorageKey: null,
      documentBackImageStorageKey: null,
      identityVerifiedAt: null,
    },
  } as Parameters<typeof PortalDancerDetailRouteView>[0]["loaderData"];
}

function buildProfessorDetailLoaderData() {
  return {
    professor: {
      id: "professor_1",
      firstName: "Luz",
      lastName: "Suárez",
      active: true,
      documentType: null,
      documentNumber: null,
      isIncomplete: true,
    },
  } as Parameters<typeof PortalProfessorDetailRouteView>[0]["loaderData"];
}
