/** @vitest-environment jsdom */

import { act } from "react";
import { afterEach, describe, expect, test } from "vitest";

import { PortalEventDocumentsMenu } from "@/components/portal/event-documents-menu";
import { eventDocumentDownloadUrls } from "@/lib/events/event-documents.test-support";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

const dancerKinds = ["minor_authorization", "adult_contract"] as const;

describe("PortalEventDocumentsMenu", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  test("offers one item per document of the surface", async () => {
    await renderMenu(
      eventDocumentDownloadUrls({
        adult_contract: "/almacenamiento?key=adulto",
        minor_authorization: "/almacenamiento?key=menor",
      }),
    );

    await openMenu();

    expect(getMenuItem("Descargar autorización para menores").tagName).toBe(
      "A",
    );
    expect(
      getMenuItem("Descargar contrato para mayores").getAttribute("href"),
    ).toBe("/almacenamiento?key=adulto");
    expect(document.body.textContent).not.toContain(
      "Descargar contrato para profesores",
    );
  });

  test("disables the item of a document the event does not have", async () => {
    await renderMenu(
      eventDocumentDownloadUrls({
        minor_authorization: "/almacenamiento?key=menor",
      }),
    );

    await openMenu();

    const unavailable = getMenuItem("Descargar contrato para mayores");

    expect(unavailable.getAttribute("data-disabled")).not.toBeNull();
    expect(unavailable.tagName).not.toBe("A");
  });

  // The academy has to be able to see the documents exist and are not published
  // yet, so an event with nothing uploaded still shows the menu.
  test("renders the trigger even when no document is available", async () => {
    await renderMenu(eventDocumentDownloadUrls());

    expect(getTrigger()).not.toBeNull();

    await openMenu();

    expect(
      getMenuItem("Descargar autorización para menores").getAttribute(
        "data-disabled",
      ),
    ).not.toBeNull();
  });

  async function renderMenu(
    documentDownloadUrls: ReturnType<typeof eventDocumentDownloadUrls>,
  ) {
    await renderer.renderAsync(
      <PortalEventDocumentsMenu
        documentDownloadUrls={documentDownloadUrls}
        kinds={dancerKinds}
      />,
    );
  }

  async function openMenu() {
    const trigger = getTrigger();

    await act(async () => {
      trigger.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      trigger.click();
    });
  }

  function getTrigger() {
    const trigger = document.querySelector<HTMLButtonElement>(
      '[aria-label="Acciones"]',
    );

    if (!trigger) {
      throw new Error("Expected the event documents trigger to be rendered.");
    }

    return trigger;
  }

  function getMenuItem(label: string) {
    const item = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((element) => element.textContent?.trim() === label);

    if (!item) {
      throw new Error(`Expected a menu item labelled "${label}".`);
    }

    return item;
  }
});
