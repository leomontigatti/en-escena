/** @vitest-environment jsdom */

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

import { DancerDetailRouteView } from "@/features/admin/dancers/detail/view";
import { DancersListRouteView } from "@/features/admin/dancers/list/view";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

describe("admin dancer view transitions", () => {
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

  test("carries the record title from the list row into the detail heading", async () => {
    useViewTransitionStateMock.mockImplementation(
      (href: string) => href === "/administracion/bailarines/dancer_1",
    );

    await renderRoute(
      "/administracion/bailarines",
      <DancersListRouteView loaderData={buildListLoaderData()} />,
    );

    const dancerLink = document.querySelector(
      'a[href="/administracion/bailarines/dancer_1"]',
    );
    expect(dancerLink?.textContent).toBe("Ana Paz");
    expect(dancerLink?.getAttribute("style")).toContain(
      "view-transition-name: record-title",
    );

    await renderRoute(
      "/administracion/bailarines/dancer_1",
      <DancerDetailRouteView loaderData={buildDetailLoaderData()} />,
    );

    const title = document.querySelector("h2");
    expect(title?.textContent).toBe("Detalle bailarín");
    expect(title?.getAttribute("style")).toContain(
      "view-transition-name: record-title",
    );
  });

  test("names no element while the list and the detail sit still", async () => {
    await renderRoute(
      "/administracion/bailarines",
      <DancersListRouteView loaderData={buildListLoaderData()} />,
    );

    expect(
      document
        .querySelector('a[href="/administracion/bailarines/dancer_1"]')
        ?.getAttribute("style"),
    ).toContain("view-transition-name: none");
  });
});

async function renderRoute(path: string, element: React.ReactElement) {
  if (root) {
    act(() => {
      root?.unmount();
    });
    root = null;
  }

  container?.remove();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  const router = createMemoryRouter([{ path, element }], {
    initialEntries: [path],
  });

  await act(async () => {
    root?.render(<RouterProvider router={router} />);
  });
}

function buildListLoaderData() {
  return {
    selectedEventId: "event_1",
    filters: {
      nameOrder: "asc",
      participation: "all",
      query: "",
      status: "active",
      identification: "all",
      page: 1,
    },
    hasAnyDancer: true,
    dancers: [
      {
        id: "dancer_1",
        firstName: "Ana",
        lastName: "Paz",
        active: true,
        academyName: "Academia Prueba",
        participationStatus: "not-participating",
        identificationStatus: "unverified",
      },
    ],
    totalCount: 1,
    totalPages: 1,
  } as Parameters<typeof DancersListRouteView>[0]["loaderData"];
}

function buildDetailLoaderData() {
  return {
    backToList: "/administracion/bailarines",
    cancelHref: "/administracion/bailarines/dancer_1",
    canEdit: false,
    dancer: {
      academy: {
        contactName: "Contacto Prueba",
        email: "academia@example.com",
        id: "academy_1",
        name: "Academia Prueba",
        phone: "1234-5678",
      },
      active: true,
      birthDate: "2015-01-01",
      choreographyNames: [],
      editConsequence: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      documentBackImageStorageKey: null,
      documentFrontImageStorageKey: null,
      documentNumber: null,
      documentType: null,
      firstName: "Ana",
      id: "dancer_1",
      identificationStatus: "unverified",
      identityVerifiedAt: null,
      inscriptions: [],
      lastName: "Paz",
      participatedInAnyEvent: false,
      participationStatus: "not-participating",
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    },
    documentImageUrls: {
      back: null,
      front: null,
    },
    editHref: "/administracion/bailarines/dancer_1?modo=editar",
    isEditing: false,
    selectedEventId: null,
  } as Parameters<typeof DancerDetailRouteView>[0]["loaderData"];
}
