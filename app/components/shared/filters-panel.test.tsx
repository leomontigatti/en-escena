/** @vitest-environment jsdom */

import { act } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { AdminShell } from "@/components/admin/shell";
import { ClientDataTable } from "@/components/shared/data-table";
import type { DataTableColumn } from "@/components/shared/data-table";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

type Row = {
  id: string;
  name: string;
  status: "active" | "archived";
};

const columns: DataTableColumn<Row>[] = [
  {
    id: "name",
    header: "Nombre",
    cell: (row) => row.name,
    filterValue: (row) => row.name,
  },
  {
    id: "filters",
    header: "Filtros",
    cell: () => null,
    hidden: true,
    filterValues: (row) => [row.status],
  },
];

describe("filters panel in the shell", () => {
  afterEach(renderer.cleanup);

  test("keeps the panel closed until the toolbar button asks for it", async () => {
    await renderShellWithTable();

    // Closed, and it takes no width from the content while it is.
    expect(getPanel().dataset.state).toBe("closed");
    expect(getPanel().textContent).toBe("");
    expect(
      getPanel().querySelector('[data-slot="filters-panel-gap"]')?.className,
    ).toContain("group-data-[state=closed]/filters-panel:w-0");

    await clickFiltersTrigger();

    expect(getPanel().dataset.state).toBe("open");
    // The group is offered as a picker, so the panel names the group and holds
    // its options behind it rather than stacking every option on screen.
    expect(getPanel().textContent).toContain("Estado");
    expect(getPanel().textContent).not.toContain("Archivado");
    expect(getPanel().querySelector('[data-slot="select-trigger"]')).not.toBe(
      null,
    );
  });

  // The panel is a sibling of the content, not a layer over it: that is what
  // makes the page narrow instead of being covered. A panel portalled to the
  // body would look the same on screen and push nothing.
  test("lays the panel out beside the content rather than over it", async () => {
    await renderShellWithTable();
    await clickFiltersTrigger();

    const panel = getPanel();

    expect(panel.parentElement?.dataset.slot).toBe("sidebar-wrapper");
    expect(panel.closest("main")).toBeNull();
    expect(document.querySelector('[data-slot="filters-panel-overlay"]')).toBe(
      null,
    );
  });

  test("closes the panel when the same button is pressed again", async () => {
    await renderShellWithTable();

    await clickFiltersTrigger();
    expect(getPanel().dataset.state).toBe("open");

    await clickFiltersTrigger();
    expect(getPanel().dataset.state).toBe("closed");
  });

  test("closes the panel on Escape from inside it", async () => {
    await renderShellWithTable();
    await clickFiltersTrigger();

    await pressEscapeOn(getPanelContainer());

    expect(getPanel().dataset.state).toBe("closed");
  });

  // A group's picker draws its options in a portal, outside the panel: the
  // Escape that dismisses the picker must not take the panel with it.
  test("leaves the panel open on Escape from a portal outside it", async () => {
    await renderShellWithTable();
    await clickFiltersTrigger();

    const portalled = document.createElement("div");
    document.body.append(portalled);

    await pressEscapeOn(portalled);

    expect(getPanel().dataset.state).toBe("open");

    portalled.remove();
  });

  test("names the panel the trigger controls", async () => {
    await renderShellWithTable();

    const trigger = getFiltersTrigger();
    const controlled = trigger.getAttribute("aria-controls");

    expect(controlled).not.toBe(null);
    expect(document.getElementById(controlled ?? "")).toBe(getPanelContainer());
  });
});

function getPanel() {
  const panel = document.querySelector('[data-slot="filters-panel"]');

  if (!(panel instanceof HTMLElement)) {
    throw new Error("Expected the shell to render the filters panel region.");
  }

  return panel;
}

function getPanelContainer() {
  const container = getPanel().querySelector(
    '[data-slot="filters-panel-container"]',
  );

  if (!(container instanceof HTMLElement)) {
    throw new Error("Expected the panel region to hold its container.");
  }

  return container;
}

function getFiltersTrigger() {
  const trigger = document.querySelector('button[aria-label^="Filtros"]');

  if (!(trigger instanceof HTMLElement)) {
    throw new Error("Expected the filters trigger to be rendered.");
  }

  return trigger;
}

async function clickFiltersTrigger() {
  const trigger = getFiltersTrigger();

  await act(async () => {
    trigger.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

async function pressEscapeOn(target: HTMLElement) {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    await Promise.resolve();
  });
}

async function renderShellWithTable() {
  await renderer.renderAsync(
    <MemoryRouter initialEntries={["/administracion/eventos"]}>
      <AdminShell
        email="admin@example.com"
        events={[{ id: "evento_2026", name: "Evento 2026", active: true }]}
        selectedEventId="evento_2026"
      >
        <ClientDataTable
          rows={[{ id: "event_1", name: "Evento Nacional", status: "active" }]}
          columns={columns}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar evento por nombre"
          textFilterColumnId="name"
          facetedFilters={[
            {
              id: "estado",
              label: "Estado",
              options: [
                { label: "Activo", value: "active" },
                { label: "Archivado", value: "archived" },
              ],
            },
          ]}
        />
      </AdminShell>
    </MemoryRouter>,
  );
}

const renderer = createReactDomTestRenderer();
