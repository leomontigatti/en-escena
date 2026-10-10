/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { useUrlTab } from "./url-tab";

const kinds = ["coreografias", "seminarios"] as const;

function KindTabs({ openingValue }: { openingValue?: (typeof kinds)[number] }) {
  const tab = useUrlTab({
    defaultValue: "coreografias",
    openingValue,
    param: "tipo",
    resets: ["pagina"],
    values: kinds,
  });

  return (
    <Tabs value={tab.value} onValueChange={tab.onValueChange}>
      <TabsList variant="line">
        <TabsTrigger value="coreografias">Coreografías</TabsTrigger>
        <TabsTrigger value="seminarios">Seminarios</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

describe("useUrlTab", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  async function mount(
    initialEntries: string[],
    openingValue?: (typeof kinds)[number],
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/precios",
          element: <KindTabs openingValue={openingValue} />,
        },
      ],
      { initialEntries },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    return router;
  }

  test("opens on the tab the link names", async () => {
    await mount(["/precios?tipo=seminarios"]);

    expect(activeTab()).toBe("Seminarios");
  });

  test("opens on the default tab when the link names none, or one that does not exist", async () => {
    await mount(["/precios"]);
    expect(activeTab()).toBe("Coreografías");

    renderer.cleanup();

    await mount(["/precios?tipo=talleres"]);
    expect(activeTab()).toBe("Coreografías");
  });

  // The plain link opens elsewhere, so it can no longer stand for the
  // default: a reload must land on the tab chosen, whichever it is.
  test("names every tab chosen once the page opens on another than the default", async () => {
    const router = await mount(["/precios"], "seminarios");
    expect(activeTab()).toBe("Seminarios");

    await selectTab("Coreografías");
    expect(router.state.location.search).toBe("?tipo=coreografias");

    await selectTab("Seminarios");
    expect(router.state.location.search).toBe("?tipo=seminarios");
  });

  test("names the tab in the URL and keeps the rest of the query", async () => {
    const router = await mount(["/precios?evento=abc"]);

    await selectTab("Seminarios");

    expect(activeTab()).toBe("Seminarios");
    expect(router.state.location.search).toBe("?evento=abc&tipo=seminarios");
  });

  // The URL only ever names the tab the page does not open on, so the plain
  // link and the default tab are one address.
  test("drops the parameter on the way back to the default tab", async () => {
    const router = await mount(["/precios?tipo=seminarios"]);

    await selectTab("Coreografías");

    expect(router.state.location.search).toBe("");
  });

  // A page number belongs to the list the reader was on.
  test("clears the parameters the tab resets", async () => {
    const router = await mount(["/precios?pagina=3"]);

    await selectTab("Seminarios");

    expect(router.state.location.search).toBe("?tipo=seminarios");
  });

  // Back leaves the page instead of stepping through the tabs.
  test("replaces the history entry instead of adding one", async () => {
    const router = await mount(["/inicio", "/precios"]);

    await selectTab("Seminarios");
    await selectTab("Coreografías");
    await selectTab("Seminarios");

    expect(router.state.historyAction).toBe("REPLACE");

    await act(async () => {
      await router.navigate(-1);
    });

    expect(router.state.location.pathname).toBe("/inicio");
  });
});

function activeTab() {
  return document.querySelector('[role="tab"][aria-selected="true"]')
    ?.textContent;
}

async function selectTab(label: string) {
  const trigger = Array.from(document.querySelectorAll('[role="tab"]')).find(
    (candidate) => candidate.textContent === label,
  );

  // Radix activates a trigger on `mousedown`, not on the click after it.
  await act(async () => {
    trigger!.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  });
}
