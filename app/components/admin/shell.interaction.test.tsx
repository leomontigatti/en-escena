/** @vitest-environment jsdom */

import { act } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { AdminShell } from "@/components/admin/shell";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

describe("AdminShell account menu", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  test("offers the username the internal user logs in with, and no email", async () => {
    await renderer.renderAsync(
      <MemoryRouter initialEntries={["/administracion"]}>
        <AdminShell
          account={{
            name: "Ada Admin",
            roleLabel: "Administrador",
            username: "ada.admin",
          }}
          events={[]}
          selectedEventId={null}
        >
          <p>Contenido administrativo</p>
        </AdminShell>
      </MemoryRouter>,
    );

    await openAccountMenu();

    expect(getMenuItemLabels()).toContain("Usuario: ada.admin");
    expect(getMenuItemLabels()).toContain("Salir");
    expect(document.body.textContent).not.toContain("@");
  });

  async function openAccountMenu() {
    const trigger = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("Ada Admin"));

    if (!trigger) {
      throw new Error("Expected the account menu trigger to be rendered.");
    }

    await act(async () => {
      trigger.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      trigger.click();
    });
  }

  function getMenuItemLabels() {
    return Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).map((item) => item.textContent?.trim());
  }
});
