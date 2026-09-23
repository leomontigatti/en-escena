/** @vitest-environment jsdom */

import type * as React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const reactRouterMocks = vi.hoisted(() => ({
  useFormAction: vi.fn(),
  useNavigation: vi.fn(),
  useSubmit: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: {
      children: React.ReactNode;
      to: string;
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
    useFormAction: reactRouterMocks.useFormAction,
    useNavigation: reactRouterMocks.useNavigation,
    useSubmit: reactRouterMocks.useSubmit,
  };
});

import { InternalUserEditCard } from "@/lib/admin/users/user-detail-edit-form";
import { updateInternalUserIntent } from "@/lib/admin/users/user-detail.shared";
import type {
  DetailActionData,
  DetailUser,
} from "@/lib/admin/users/user-detail.shared";
import {
  createReactDomTestRenderer,
  getButton,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

describe("InternalUserEditCard", () => {
  afterEach(() => {
    renderer.cleanup();
    vi.restoreAllMocks();
    reactRouterMocks.useFormAction.mockReset();
    reactRouterMocks.useNavigation.mockReset();
    reactRouterMocks.useSubmit.mockReset();
  });

  test("keeps Guardar disabled until a field changes", async () => {
    renderIdleCard();

    expect(getButton("Guardar").disabled).toBe(true);

    await updateReactDomForm(() => {
      setInputValue(getInput("name"), "Ana Jueza");
    });

    expect(getButton("Guardar").disabled).toBe(false);
  });

  test("asks for no email", () => {
    renderIdleCard();

    expect(document.querySelector('input[name="email"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Correo");
  });

  test("submits through React Router instead of the native form submit", async () => {
    const submitSpy = vi.fn();
    const nativeSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});

    renderIdleCard(submitSpy);

    await updateReactDomForm(() => {
      setInputValue(getInput("name"), "Ana Jueza");
    });

    await updateReactDomForm(() => {
      getForm().requestSubmit(getButton("Guardar"));
    });

    expect(nativeSubmitSpy).not.toHaveBeenCalled();
    expect(submitSpy).toHaveBeenCalledTimes(1);

    const [submitted] = submitSpy.mock.calls[0] as [FormData];

    expect(submitted.get("intent")).toBe(updateInternalUserIntent);
    expect(submitted.get("name")).toBe("Ana Jueza");
  });

  test("disables Guardar while the edit intent is in flight", () => {
    const formData = new FormData();
    formData.set("intent", updateInternalUserIntent);

    reactRouterMocks.useFormAction.mockReturnValue(
      "/administracion/usuarios/user_1",
    );
    reactRouterMocks.useNavigation.mockReturnValue({
      formData,
      formMethod: "post",
      state: "submitting",
    });
    reactRouterMocks.useSubmit.mockReturnValue(vi.fn());

    renderer.render(
      <InternalUserEditCard
        cancelHref="/administracion/usuarios"
        user={buildUser()}
      />,
    );

    expect(getButton("Guardar").disabled).toBe(true);
  });

  test("locks an administrator's main permission and still submits it", async () => {
    const submitSpy = vi.fn();

    renderIdleCard(
      submitSpy,
      buildUser({ mainRole: "admin", name: "Ada Admin" }),
    );

    expect(document.querySelector('[role="combobox"]')).toBeNull();
    expect(getLockedInputValues()).toContain("Administrador");

    await updateReactDomForm(() => {
      setInputValue(getInput("name"), "Ada Administradora");
    });

    await updateReactDomForm(() => {
      getForm().requestSubmit(getButton("Guardar"));
    });

    const [submitted] = submitSpy.mock.calls[0] as [FormData];

    expect(submitted.get("role")).toBe("admin");
  });

  test("keeps Guardar enabled after the server refuses the save", () => {
    renderIdleCard(vi.fn(), buildUser(), {
      form: "edit",
      status: "error",
      message: "No se puede cambiar el permiso de un Administrador.",
      fieldErrors: {},
      resetPasswordFieldErrors: {},
      editValues: { name: "Ana Jueza", role: "judge" },
      resetPasswordValues: { temporaryPassword: "" },
    });

    // The refusal refills the form with what was typed, so nothing is dirty —
    // but the retry has to stay available.
    expect(getInput("name").value).toBe("Ana Jueza");
    expect(getButton("Guardar").disabled).toBe(false);
  });

  test("keeps its own values when another intent on the route fails", () => {
    renderIdleCard(vi.fn(), buildUser(), {
      form: "status",
      status: "error",
      message: "No podés suspender al último administrador activo.",
      fieldErrors: {},
      resetPasswordFieldErrors: {},
      editValues: { name: "", role: "judge" },
      resetPasswordValues: { temporaryPassword: "" },
    });

    // A suspension refusal carries this form's empty `editValues`; adopting
    // them blanked `Nombre` on a form the administrator never submitted.
    expect(getInput("name").value).toBe("Ana Juez");
    expect(getButton("Guardar").disabled).toBe(true);
  });

  test("keeps the main permission editable for a non-administrator", () => {
    renderIdleCard();

    expect(document.querySelector('[role="combobox"]')).not.toBeNull();
    expect(getLockedInputValues()).not.toContain("Juez");
  });

  function renderIdleCard(
    submitSpy = vi.fn(),
    user = buildUser(),
    actionData?: DetailActionData,
  ) {
    reactRouterMocks.useFormAction.mockReturnValue(
      "/administracion/usuarios/user_1",
    );
    reactRouterMocks.useNavigation.mockReturnValue({ state: "idle" });
    reactRouterMocks.useSubmit.mockReturnValue(submitSpy);

    renderer.render(
      <InternalUserEditCard
        actionData={actionData}
        cancelHref="/administracion/usuarios"
        user={user}
      />,
    );
  }
});

function buildUser(overrides: Partial<DetailUser> = {}): DetailUser {
  return {
    academyId: null,
    academyName: null,
    email: null,
    identifier: "ana.juez",
    id: "user_1",
    mainRole: "judge",
    name: "Ana Juez",
    state: "active",
    userType: "internal",
    ...overrides,
  };
}

function getLockedInputValues() {
  return Array.from(document.querySelectorAll("input[readonly]")).map(
    (input) => (input as HTMLInputElement).value,
  );
}

function getInput(name: string) {
  const input = document.querySelector(`input[name="${name}"]`);

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Expected an input named "${name}".`);
  }

  return input;
}

function getForm() {
  const form = document.querySelector("form");

  if (!(form instanceof HTMLFormElement)) {
    throw new Error("Expected the edit form to be rendered.");
  }

  return form;
}
