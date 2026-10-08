/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

const transitioningPaths = vi.hoisted(() => new Set<string>());

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useViewTransitionState: (to: string) => transitioningPaths.has(to),
  };
});

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { PortalPageHeader } from "@/components/portal/ui";
import { BackButton } from "@/components/shared/action-buttons";
import { DataTableLink } from "@/components/shared/data-table-link";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
  transitioningPaths.clear();
});

describe("record title view transition", () => {
  test("a record's link carries the title only while the navigation targets its URL", async () => {
    transitioningPaths.add("/registros/1");

    await renderAt(
      "/registros",
      <>
        <DataTableLink recordTitle to="/registros/1">
          Ana Paz
        </DataTableLink>
        <DataTableLink recordTitle to="/registros/2">
          Luz Suárez
        </DataTableLink>
        <DataTableLink to="/registros/1">Academia Prueba</DataTableLink>
      </>,
    );

    expect(carriesRecordTitle(findLink("Ana Paz"))).toBe(true);
    expect(carriesRecordTitle(findLink("Luz Suárez"))).toBe(false);
    expect(carriesRecordTitle(findLink("Academia Prueba"))).toBe(false);
  });

  test("a record's link starts a view transition", async () => {
    const router = await renderAt(
      "/registros",
      <DataTableLink recordTitle to="/registros/1">
        Ana Paz
      </DataTableLink>,
    );
    const transitions = recordViewTransitions(router);

    await click(findLink("Ana Paz"));

    expect(router.state.location.pathname).toBe("/registros/1");
    expect(transitions).toEqual([true]);
  });

  test("the admin title carries the record title during a transition touching its page", async () => {
    await renderAt(
      "/registros/1",
      <AdminResourceLayout
        title="Ana Paz"
        description="Bailarina"
        requireSelectedEvent={false}
      >
        {null}
      </AdminResourceLayout>,
    );

    expect(carriesRecordTitle(findHeading("Ana Paz"))).toBe(false);

    transitioningPaths.add("/registros/1");
    await renderAt(
      "/registros/1",
      <AdminResourceLayout
        title="Ana Paz"
        description="Bailarina"
        requireSelectedEvent={false}
      >
        {null}
      </AdminResourceLayout>,
    );

    expect(carriesRecordTitle(findHeading("Ana Paz"))).toBe(true);
  });

  test("the portal title carries the record title during a transition touching its page", async () => {
    await renderAt(
      "/registros/1",
      <PortalPageHeader
        titleId="titulo"
        title="Ana Paz"
        description="Bailarina"
      />,
    );

    expect(carriesRecordTitle(findHeading("Ana Paz"))).toBe(false);

    transitioningPaths.add("/registros/1");
    await renderAt(
      "/registros/1",
      <PortalPageHeader
        titleId="titulo"
        title="Ana Paz"
        description="Bailarina"
      />,
    );

    expect(carriesRecordTitle(findHeading("Ana Paz"))).toBe(true);
  });

  test("`Volver` starts a view transition back to its list", async () => {
    const router = await renderAt(
      "/registros/1",
      <BackButton to="/registros" />,
    );
    const transitions = recordViewTransitions(router);

    await click(findLink("Volver"));

    expect(router.state.location.pathname).toBe("/registros");
    expect(transitions).toEqual([true]);
  });
});

type TestRouter = ReturnType<typeof createMemoryRouter>;

async function renderAt(path: string, element: ReactNode) {
  renderer.cleanup();

  const router = createMemoryRouter(
    [
      { path, element },
      { path: "*", element: null },
    ],
    { initialEntries: [path] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);

  return router;
}

function recordViewTransitions(router: TestRouter) {
  const transitions: boolean[] = [];

  router.subscribe((_state, { viewTransitionOpts }) => {
    transitions.push(viewTransitionOpts != null);
  });

  return transitions;
}

function findLink(name: string) {
  const link = [...document.querySelectorAll("a")].find(
    (anchor) => anchor.textContent?.trim() === name,
  );

  if (!link) {
    throw new Error(`Expected a link named "${name}".`);
  }

  return link;
}

function findHeading(name: string) {
  const heading = [...document.querySelectorAll("h2")].find(
    (element) => element.textContent?.trim() === name,
  );

  if (!heading) {
    throw new Error(`Expected a heading named "${name}".`);
  }

  return heading;
}

function carriesRecordTitle(element: Element) {
  return element.hasAttribute("data-record-title");
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );
  });
}
