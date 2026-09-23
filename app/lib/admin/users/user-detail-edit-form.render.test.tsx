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
import type { DetailUser } from "@/lib/admin/users/user-detail.shared";
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

  test("marks the optional email with a placeholder", () => {
    renderIdleCard();

    expect(getInput("email").placeholder).toBe("Opcional");
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

  function renderIdleCard(submitSpy = vi.fn()) {
    reactRouterMocks.useFormAction.mockReturnValue(
      "/administracion/usuarios/user_1",
    );
    reactRouterMocks.useNavigation.mockReturnValue({ state: "idle" });
    reactRouterMocks.useSubmit.mockReturnValue(submitSpy);

    renderer.render(
      <InternalUserEditCard
        cancelHref="/administracion/usuarios"
        user={buildUser()}
      />,
    );
  }
});

function buildUser(): DetailUser {
  return {
    academyId: null,
    academyName: null,
    email: "ana@example.com",
    identifier: "ana.juez",
    id: "user_1",
    mainRole: "judge",
    name: "Ana Juez",
    state: "active",
    userType: "internal",
  };
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
