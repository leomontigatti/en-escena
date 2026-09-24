/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { AcademyDetailRouteView } from "@/features/admin/academies/detail/view";
import type { AcademyDetailLoaderData } from "@/features/admin/academies/detail/shared";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

const academyPath = "/administracion/academias/academy_1";

function buildLoaderData(canEdit: boolean): AcademyDetailLoaderData {
  return {
    academy: {
      contactName: "Nora Norte",
      email: "academia@example.com",
      id: "academy_1",
      name: "Academia Fork",
      phone: "3415551234",
    },
    canEdit,
    selectedEventId: null,
  };
}

async function renderDetail({
  canEdit = true,
  initialDeleteDialogOpen = false,
}: {
  canEdit?: boolean;
  initialDeleteDialogOpen?: boolean;
} = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "/administracion/academias/:academyId",
        action: async () => null,
        element: (
          <AcademyDetailRouteView
            initialDeleteDialogOpen={initialDeleteDialogOpen}
            loaderData={buildLoaderData(canEdit)}
          />
        ),
      },
    ],
    { initialEntries: [academyPath] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
}

/**
 * The actions menu only mounts its items once it opens, and the trigger opens on
 * `pointerdown` rather than on `click`.
 */
async function openActionsMenu() {
  const trigger = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Acciones"]',
  );

  if (!trigger) {
    throw new Error("Expected the actions menu trigger to be rendered.");
  }

  await act(async () => {
    trigger.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });

  return trigger;
}

/** Scoped to the dialog, so the edit form's own `intent` is not what is read. */
function readDialogHiddenValue(name: string) {
  const dialog = document.querySelector('[role="alertdialog"]');

  if (!dialog) {
    throw new Error("Expected the delete dialog to be rendered.");
  }

  return dialog.querySelector<HTMLInputElement>(
    `input[type="hidden"][name="${name}"]`,
  )?.value;
}

describe("AcademyDetailRouteView", () => {
  test("opens the delete dialog from the actions menu", async () => {
    await renderDetail();
    await openActionsMenu();

    const item = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((candidate) => candidate.textContent === "Eliminar");

    if (!item) {
      throw new Error("Expected the delete menu item to be rendered.");
    }

    await act(async () => {
      item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Eliminar academia");
    expect(document.body.textContent).toContain("Academia Fork");
    expect(document.body.textContent).toContain("Esta acción es irreversible.");
  });

  test("submits the delete intent with the academy's own confirmation", async () => {
    await renderDetail({ initialDeleteDialogOpen: true });

    expect(readDialogHiddenValue("intent")).toBe("delete-academy");
    expect(readDialogHiddenValue("id")).toBe("academy_1");
    expect(readDialogHiddenValue("confirmDeletion")).toBe("academy_1");
  });

  test("offers no delete action to a read-only auditor", async () => {
    await renderDetail({ canEdit: false, initialDeleteDialogOpen: true });

    expect(document.querySelector('button[aria-label="Acciones"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Eliminar academia");
  });
});
