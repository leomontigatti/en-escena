/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { InternalUserDetailRouteView } from "@/features/admin/users/detail/view";
import type {
  DetailUser,
  UserDetailLoaderData,
} from "@/lib/admin/users/user-detail.shared";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

const useNavigationMock = vi.hoisted(() => vi.fn());

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useNavigation: useNavigationMock,
  };
});

describe("InternalUserDetailRouteView suspension", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  test("confirms a suspension in a dialog instead of posting on the menu item", async () => {
    const action = vi.fn(async () => null);

    await renderDetail({ action });
    await chooseMenuItem("Suspender usuario");

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("¿Suspender a Ana Juez?");
    expect(dialog?.textContent).toContain(
      "Se cierran sus sesiones y no podrá ingresar hasta que lo reactives.",
    );
    expect(dialog?.textContent).toContain(
      "Conserva su historial y sus asignaciones de juez.",
    );
    expect(action).not.toHaveBeenCalled();
  });

  test("posts the suspend intent only once the destructive button is pressed", async () => {
    const action = vi.fn(async () => null);

    await renderDetail({ action });
    await chooseMenuItem("Suspender usuario");

    const confirm = getConfirmButton();

    expect(confirm.form?.querySelector('input[name="intent"]')).toHaveProperty(
      "value",
      "suspend-user",
    );

    await act(async () => {
      confirm.click();
      await Promise.resolve();
    });

    expect(action).toHaveBeenCalledTimes(1);
  });

  test("disables the confirmation while the suspension is in flight", async () => {
    const formData = new FormData();
    formData.set("intent", "suspend-user");
    await renderDetail({
      navigation: { formData, formMethod: "post", state: "submitting" },
    });
    await chooseMenuItem("Suspender usuario");

    expect(getConfirmButton().disabled).toBe(true);
  });

  test("keeps reactivation a single click with no dialog", async () => {
    const action = vi.fn(async () => null);

    await renderDetail({
      action,
      user: { state: "suspended" },
    });
    await chooseMenuItem("Reactivar usuario");

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(action).toHaveBeenCalledTimes(1);
  });

  async function renderDetail({
    action = vi.fn(async () => null),
    navigation = { state: "idle" },
    user,
  }: {
    action?: () => Promise<null>;
    navigation?: {
      formData?: FormData;
      formMethod?: string;
      state: string;
    };
    user?: Partial<DetailUser>;
  } = {}) {
    useNavigationMock.mockReturnValue(navigation);

    const router = createMemoryRouter(
      [
        {
          path: "/administracion/usuarios/:userId",
          action,
          element: (
            <InternalUserDetailRouteView loaderData={buildLoaderData(user)} />
          ),
        },
      ],
      { initialEntries: ["/administracion/usuarios/user_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }
});

function getConfirmButton() {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === "Suspender",
  );

  if (!button) {
    throw new Error("Expected the Suspender confirmation button.");
  }

  return button;
}

/**
 * The actions menu mounts its items only once it opens, and the trigger opens
 * on `pointerdown` rather than on `click`.
 */
async function chooseMenuItem(label: string) {
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

  const item = Array.from(
    document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ).find((candidate) => candidate.textContent?.trim() === label);

  if (!item) {
    throw new Error(`Expected the ${label} menu item to be rendered.`);
  }

  await act(async () => {
    item.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

function buildLoaderData(user: Partial<DetailUser> = {}): UserDetailLoaderData {
  return {
    backToList: "/administracion/usuarios",
    canManage: true,
    cancelHref: "/administracion/usuarios/user_1",
    editHref: "/administracion/usuarios/user_1?modo=editar",
    isEditing: false,
    isResettingPassword: false,
    resetPasswordHref:
      "/administracion/usuarios/user_1?modo=restablecer-contrasena",
    user: {
      academyId: null,
      academyName: null,
      email: "ana@example.com",
      identifier: "ana.juez",
      id: "user_1",
      mainRole: "judge",
      name: "Ana Juez",
      state: "active",
      userType: "internal",
      ...user,
    },
  };
}
