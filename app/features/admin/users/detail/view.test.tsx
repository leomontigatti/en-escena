/** @vitest-environment jsdom */

import { act } from "react";
import {
  createMemoryRouter,
  RouterProvider,
  useActionData,
} from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { InternalUserDetailRouteView } from "@/features/admin/users/detail/view";
import {
  buildDetailActionSuccess,
  type DetailUser,
  type DetailViewActionData,
  type UserDetailLoaderData,
} from "@/lib/admin/users/user-detail.shared";
import {
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const useNavigationMock = vi.hoisted(() => vi.fn());

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useNavigation: useNavigationMock,
  };
});

describe("InternalUserDetailRouteView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  test("opens a dialog from the menu without leaving the detail", async () => {
    await renderDetail();

    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await chooseMenuItem("Restablecer contraseña");

    const dialog = document.querySelector('[role="dialog"]');

    expect(dialog?.textContent).toContain("Guardar contraseña temporal");
    expect(dialog?.textContent).toContain("Cancelar");
  });

  test("keeps the submit disabled while the password is empty", async () => {
    await renderDetail();
    await chooseMenuItem("Restablecer contraseña");

    expect(getResetSubmit().disabled).toBe(true);

    await typePassword("Temporal-2026");

    expect(getResetSubmit().disabled).toBe(false);
  });

  test("disables the submit while the reset is in flight", async () => {
    const formData = new FormData();
    formData.set("intent", "reset-password");
    await renderDetail({
      navigation: { formData, formMethod: "post", state: "submitting" },
    });
    await chooseMenuItem("Restablecer contraseña");
    await typePassword("Temporal-2026");

    expect(getResetSubmit().disabled).toBe(true);
  });

  test("closes the dialog once the reset succeeds", async () => {
    await renderDetail({
      action: async () =>
        buildDetailActionSuccess("usuario-interno-restablecido"),
    });
    await chooseMenuItem("Restablecer contraseña");
    await typePassword("Temporal-2026");

    await act(async () => {
      getResetSubmit().click();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test("stays open and shows the reason when the reset is refused", async () => {
    await renderDetail({
      action: async () => ({
        status: "error" as const,
        message: "No se pudo restablecer la contraseña.",
        form: "reset-password" as const,
        fieldErrors: {},
        resetPasswordFieldErrors: {},
        editValues: { name: "", role: "judge" as const },
        resetPasswordValues: { temporaryPassword: "Temporal-2026" },
      }),
    });
    await chooseMenuItem("Restablecer contraseña");
    await typePassword("Temporal-2026");

    await act(async () => {
      getResetSubmit().click();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const dialog = document.querySelector('[role="dialog"]');

    expect(dialog?.textContent).toContain(
      "No se pudo restablecer la contraseña.",
    );
  });

  test("asks before closing with a typed password", async () => {
    await renderDetail();
    await chooseMenuItem("Restablecer contraseña");
    await typePassword("Temporal-2026");

    await act(async () => {
      getButtonByText("Cancelar", '[role="dialog"]').click();
      await Promise.resolve();
    });

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  });

  test("closes without asking when nothing was typed", async () => {
    await renderDetail();
    await chooseMenuItem("Restablecer contraseña");

    await act(async () => {
      getButtonByText("Cancelar", '[role="dialog"]').click();
      await Promise.resolve();
    });

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
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

  test("closes the confirmation once the suspension succeeds", async () => {
    await renderDetail({
      action: async () =>
        buildDetailActionSuccess("usuario-interno-suspendido"),
    });
    await chooseMenuItem("Suspender usuario");

    await act(async () => {
      getConfirmButton().click();
      await Promise.resolve();
    });

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  test("leaves the confirmation open when the suspension is refused", async () => {
    await renderDetail({
      action: async () => ({
        status: "error" as const,
        message: "No se puede suspender al último administrador activo.",
        form: "status" as const,
        fieldErrors: {},
        resetPasswordFieldErrors: {},
        editValues: { name: "", email: "", role: "judge" as const },
        resetPasswordValues: { temporaryPassword: "" },
      }),
    });
    await chooseMenuItem("Suspender usuario");

    await act(async () => {
      getConfirmButton().click();
      await Promise.resolve();
    });

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
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
    action?: () => Promise<DetailViewActionData | null>;
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
          element: <DetailRoute user={user} />,
        },
      ],
      { initialEntries: ["/administracion/usuarios/user_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }
});

/**
 * The route element, reading `actionData` the way the real route module does,
 * so a test can act on what the action returned.
 */
function DetailRoute({ user }: { user?: Partial<DetailUser> }) {
  const actionData = useActionData() as DetailViewActionData | undefined;

  return (
    <InternalUserDetailRouteView
      actionData={actionData}
      loaderData={buildLoaderData(user)}
    />
  );
}

function getResetSubmit() {
  return getButtonByText("Guardar contraseña temporal", '[role="dialog"]');
}

function getButtonByText(text: string, scope: string) {
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>(`${scope} button`),
  ).find((candidate) => candidate.textContent?.trim() === text);

  if (!button) {
    throw new Error(`Expected a "${text}" button in ${scope}.`);
  }

  return button;
}

async function typePassword(value: string) {
  const input = document.querySelector<HTMLInputElement>(
    'input[name="temporaryPassword"]',
  );

  if (!input) {
    throw new Error("Expected the temporary password field.");
  }

  await updateReactDomForm(() => setInputValue(input, value));
}

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
