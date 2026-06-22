/** @vitest-environment jsdom */

import "@/test/react-test-env";

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

const useFetcherMock = vi.hoisted(() => vi.fn());
const useNavigationMock = vi.hoisted(() => vi.fn());
const useSubmitMock = vi.hoisted(() => vi.fn());
const useViewTransitionStateMock = vi.hoisted(() =>
  vi.fn((_: string) => false),
);

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useActionData: () => undefined,
    useFetcher: useFetcherMock,
    useNavigation: useNavigationMock,
    useSubmit: useSubmitMock,
    useViewTransitionState: useViewTransitionStateMock,
  };
});

import { PortalBailarinDetalleRouteView } from "@/routes/portal.bailarines_.$dancerId";
import { PortalBailarinesRouteView } from "@/routes/portal.bailarines";
import { PortalProfesoresRouteView } from "@/routes/portal.profesores";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

type FetcherState = {
  data: undefined;
  state: "idle" | "submitting";
  submit: ReturnType<typeof vi.fn>;
};

describe("portal simple form submissions", () => {
  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }

    container?.remove();
    container = null;
    document.body.innerHTML = "";
    useFetcherMock.mockReset();
    useNavigationMock.mockReset();
    useSubmitMock.mockReset();
    useViewTransitionStateMock.mockReset();
    useViewTransitionStateMock.mockReturnValue(false);
  });

  test("keeps the professor create dialog mounted and disables duplicate submits while saving", async () => {
    useFetcherMock.mockReturnValue({
      data: undefined,
      state: "submitting",
      submit: vi.fn(),
    });
    useNavigationMock.mockReturnValue({ formData: undefined, state: "idle" });
    useSubmitMock.mockReturnValue(vi.fn());

    await render(
      <MemoryRouter initialEntries={["/portal/profesores"]}>
        <PortalProfesoresRouteView loaderData={buildProfessorLoaderData()} />
      </MemoryRouter>,
    );

    await act(async () => {
      clickButton("Nuevo profesor");
    });

    expect(document.body.textContent).toContain("Nuevo profesor");
    const submitButton = getButton("Guardar");

    expect(submitButton.disabled).toBe(true);
    expect(submitButton.querySelector("svg.animate-spin")).not.toBeNull();
  });

  test("closes the professor create dialog after a successful fetcher submission", async () => {
    let fetcherState: FetcherState = {
      data: undefined,
      state: "submitting",
      submit: vi.fn(),
    };

    useFetcherMock.mockImplementation(() => fetcherState);
    useNavigationMock.mockReturnValue({ formData: undefined, state: "idle" });
    useSubmitMock.mockReturnValue(vi.fn());

    const buildElement = () => (
      <MemoryRouter initialEntries={["/portal/profesores"]}>
        <PortalProfesoresRouteView loaderData={buildProfessorLoaderData()} />
      </MemoryRouter>
    );

    await render(buildElement());

    await act(async () => {
      clickButton("Nuevo profesor");
    });

    expect(document.body.textContent).toContain("Nuevo profesor");

    fetcherState = {
      data: undefined,
      state: "idle",
      submit: fetcherState.submit,
    };

    await act(async () => {
      root?.render(buildElement());
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test("closes the dancer create dialog after a successful fetcher submission", async () => {
    let fetcherState: FetcherState = {
      data: undefined,
      state: "submitting",
      submit: vi.fn(),
    };

    useFetcherMock.mockImplementation(() => fetcherState);
    useNavigationMock.mockReturnValue({ formData: undefined, state: "idle" });
    useSubmitMock.mockReturnValue(vi.fn());

    const buildElement = () => (
      <MemoryRouter initialEntries={["/portal/bailarines"]}>
        <PortalBailarinesRouteView loaderData={buildDancersLoaderData()} />
      </MemoryRouter>
    );

    await render(buildElement());

    await act(async () => {
      clickButton("Nuevo bailarín");
    });

    expect(document.body.textContent).toContain("Nuevo bailarín");

    fetcherState = {
      data: undefined,
      state: "idle",
      submit: fetcherState.submit,
    };

    await act(async () => {
      root?.render(buildElement());
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test("submits the professor create dialog as FormData through the fetcher", async () => {
    const nativeSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});
    const submitSpy = vi.fn();

    useFetcherMock.mockReturnValue({
      data: undefined,
      state: "idle",
      submit: submitSpy,
    });
    useNavigationMock.mockReturnValue({ formData: undefined, state: "idle" });
    useSubmitMock.mockReturnValue(vi.fn());

    await render(
      <MemoryRouter initialEntries={["/portal/profesores"]}>
        <PortalProfesoresRouteView loaderData={buildProfessorLoaderData()} />
      </MemoryRouter>,
    );

    await act(async () => {
      clickButton("Nuevo profesor");
    });

    const form = document.querySelector("form");
    const firstNameInput = document.querySelector('input[name="firstName"]');
    const lastNameInput = document.querySelector('input[name="lastName"]');

    expect(form).toBeInstanceOf(HTMLFormElement);
    expect(firstNameInput).toBeInstanceOf(HTMLInputElement);
    expect(lastNameInput).toBeInstanceOf(HTMLInputElement);

    await act(async () => {
      setInputValue(firstNameInput as HTMLInputElement, "Ana");
      setInputValue(lastNameInput as HTMLInputElement, "Paz");
      (form as HTMLFormElement).requestSubmit(getButton("Guardar"));
      await Promise.resolve();
    });

    expect(nativeSubmitSpy).not.toHaveBeenCalled();
    expect(submitSpy).toHaveBeenCalledTimes(1);

    const [submission, options] = submitSpy.mock.calls[0]!;

    expect(submission).toBeInstanceOf(FormData);
    expect((submission as FormData).get("intent")).toBe("create-professor");
    expect((submission as FormData).get("firstName")).toBe("Ana");
    expect((submission as FormData).get("lastName")).toBe("Paz");
    expect(options).toEqual({ method: "post" });
  });

  test("disables the Bailarín save action while the edit submission is pending", async () => {
    const formData = new FormData();
    formData.set("intent", "update-dancer");

    useFetcherMock.mockReturnValue({
      data: undefined,
      state: "idle",
      submit: vi.fn(),
    });
    useNavigationMock.mockReturnValue({
      formData,
      state: "submitting",
    });
    useSubmitMock.mockReturnValue(vi.fn());

    await render(
      <MemoryRouter initialEntries={["/portal/bailarines/dancer_1"]}>
        <PortalBailarinDetalleRouteView
          loaderData={buildDancerDetailLoaderData()}
        />
      </MemoryRouter>,
    );

    const submitButton = getButton("Guardar");

    expect(submitButton.disabled).toBe(true);
    expect(submitButton.querySelector("svg.animate-spin")).not.toBeNull();
  });
});

async function render(element: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(element);
  });
}

function buildProfessorLoaderData(): Parameters<
  typeof PortalProfesoresRouteView
>[0]["loaderData"] {
  return {
    professors: [],
  };
}

function buildDancersLoaderData(): Parameters<
  typeof PortalBailarinesRouteView
>[0]["loaderData"] {
  return {
    dancers: [],
  };
}

function buildDancerDetailLoaderData(): Parameters<
  typeof PortalBailarinDetalleRouteView
>[0]["loaderData"] {
  return {
    dancer: {
      id: "dancer_1",
      academyId: "academy_1",
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2014-01-01",
      documentType: null,
      documentNumber: null,
      documentFrontImageStorageKey: null,
      documentBackImageStorageKey: null,
      identityVerifiedAt: null,
      active: true,
      createdAt: new Date("2026-01-01T12:00:00Z"),
      updatedAt: new Date("2026-01-02T12:00:00Z"),
    },
  };
}

function clickButton(label: string) {
  getButton(label).click();
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getButton(label: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(label),
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button "${label}" to be rendered.`);
  }

  return button;
}
