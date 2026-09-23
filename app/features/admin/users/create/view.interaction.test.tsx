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

import { NewInternalUserRouteView } from "@/features/admin/users/create/view";
import {
  createReactDomTestRenderer,
  getButton,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

describe("NewInternalUserRouteView interactions", () => {
  afterEach(() => {
    renderer.cleanup();
    vi.restoreAllMocks();
    reactRouterMocks.useFormAction.mockReset();
    reactRouterMocks.useNavigation.mockReset();
    reactRouterMocks.useSubmit.mockReset();
  });

  test("keeps every rule in a placeholder and drops the field descriptions", () => {
    renderIdleView();

    expect(getInput("internalUsername").placeholder).toBe(
      "Solo minúsculas, números, puntos, guion o guion bajo",
    );
    expect(getInput("temporaryPassword").placeholder).toBe(
      "Mínimo 8 caracteres",
    );
    expect(document.body.textContent).not.toContain(
      "Usá solo letras minúsculas",
    );
    expect(document.body.textContent).not.toContain(
      "Debe tener al menos 8 caracteres.",
    );
    expect(document.body.textContent).not.toContain(
      "No se verifica ni se usa para ingresar.",
    );
  });

  test("asks for no email", () => {
    renderIdleView();

    expect(document.querySelector('input[name="email"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Correo");
  });

  test("shows no error on blur before the first submit, then validates on submit and clears live", async () => {
    const submitSpy = vi.fn();

    renderIdleView(submitSpy);

    const usernameInput = getInput("internalUsername");

    await updateReactDomForm(() => {
      usernameInput.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    });

    expect(document.body.textContent).not.toContain(
      "Este campo es obligatorio.",
    );

    const form = getForm();

    await updateReactDomForm(() => {
      form.requestSubmit(getButton("Guardar"));
    });

    expect(document.body.textContent).toContain("Este campo es obligatorio.");
    expect(submitSpy).not.toHaveBeenCalled();

    await updateReactDomForm(() => {
      setInputValue(getInput("name"), "Ana Juez");
      setInputValue(getInput("internalUsername"), "ana.juez");
      setInputValue(getInput("temporaryPassword"), "contrasena8");
    });

    expect(document.body.textContent).not.toContain(
      "Este campo es obligatorio.",
    );
  });

  test("submits through React Router with the create intent", async () => {
    const submitSpy = vi.fn();
    const nativeSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});

    renderIdleView(submitSpy);

    await updateReactDomForm(() => {
      setInputValue(getInput("name"), "Ana Juez");
      setInputValue(getInput("internalUsername"), "ana.juez");
      setInputValue(getInput("temporaryPassword"), "contrasena8");
    });

    await updateReactDomForm(() => {
      getForm().requestSubmit(getButton("Guardar"));
    });

    expect(nativeSubmitSpy).not.toHaveBeenCalled();
    expect(submitSpy).toHaveBeenCalledTimes(1);

    const [submitted] = submitSpy.mock.calls[0] as [FormData];

    expect(submitted).toBeInstanceOf(FormData);
    expect(submitted.get("intent")).toBe("create-internal-user");
    expect(submitted.get("internalUsername")).toBe("ana.juez");
  });

  test("disables the submit button while the create intent is in flight", () => {
    const formData = new FormData();
    formData.set("intent", "create-internal-user");

    reactRouterMocks.useFormAction.mockReturnValue(
      "/administracion/usuarios/nuevo",
    );
    reactRouterMocks.useNavigation.mockReturnValue({
      formData,
      formMethod: "post",
      state: "submitting",
    });
    reactRouterMocks.useSubmit.mockReturnValue(vi.fn());

    renderer.render(<NewInternalUserRouteView />);

    expect(getButton("Guardar").disabled).toBe(true);
  });

  function renderIdleView(submitSpy = vi.fn()) {
    reactRouterMocks.useFormAction.mockReturnValue(
      "/administracion/usuarios/nuevo",
    );
    reactRouterMocks.useNavigation.mockReturnValue({ state: "idle" });
    reactRouterMocks.useSubmit.mockReturnValue(submitSpy);

    renderer.render(<NewInternalUserRouteView />);
  }
});

function getInput(name: string) {
  const input = document.querySelector(`[name="${name}"]`);

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Expected an input named "${name}".`);
  }

  return input;
}

function getForm() {
  const form = document.querySelector("form");

  if (!(form instanceof HTMLFormElement)) {
    throw new Error("Expected the create form to be rendered.");
  }

  return form;
}
