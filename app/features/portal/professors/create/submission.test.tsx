/** @vitest-environment jsdom */

import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

import {
  clickButton,
  installPortalSubmissionTestHooks,
  portalSubmissionRouterMocks,
  renderPortalSubmission,
  rerenderPortalSubmission,
  type PortalSubmissionFetcherState,
  updatePortalSubmissionForm,
} from "@/features/portal/test-support/submission";
import { getButton, setInputValue } from "@/lib/test-support/react-dom";
import { PortalProfessorsListRouteView } from "@/features/portal/professors/list/view";

installPortalSubmissionTestHooks();

describe("professor create submissions", () => {
  test("keeps the create dialog mounted and disables duplicate submits while saving", async () => {
    portalSubmissionRouterMocks.useFetcher.mockReturnValue({
      data: undefined,
      state: "submitting",
      submit: vi.fn(),
    });
    portalSubmissionRouterMocks.useNavigation.mockReturnValue({
      formData: undefined,
      state: "idle",
    });
    portalSubmissionRouterMocks.useSubmit.mockReturnValue(vi.fn());

    await renderPortalSubmission(
      <MemoryRouter initialEntries={["/portal/profesores"]}>
        <PortalProfessorsListRouteView
          loaderData={buildProfessorLoaderData()}
        />
      </MemoryRouter>,
    );

    await clickButton("Nuevo profesor");

    expect(document.body.textContent).toContain("Nuevo profesor");
    const submitButton = getButton("Guardar");

    expect(submitButton.disabled).toBe(true);
    expect(submitButton.querySelector("svg.animate-spin")).not.toBeNull();
  });

  test("closes the create dialog after a successful fetcher submission", async () => {
    let fetcherState: PortalSubmissionFetcherState = {
      data: undefined,
      state: "submitting",
      submit: vi.fn(),
    };

    portalSubmissionRouterMocks.useFetcher.mockImplementation(
      () => fetcherState,
    );
    portalSubmissionRouterMocks.useNavigation.mockReturnValue({
      formData: undefined,
      state: "idle",
    });
    portalSubmissionRouterMocks.useSubmit.mockReturnValue(vi.fn());

    const buildElement = () => (
      <MemoryRouter initialEntries={["/portal/profesores"]}>
        <PortalProfessorsListRouteView
          loaderData={buildProfessorLoaderData()}
        />
      </MemoryRouter>
    );

    await renderPortalSubmission(buildElement());

    await clickButton("Nuevo profesor");

    expect(document.body.textContent).toContain("Nuevo profesor");

    fetcherState = {
      data: undefined,
      state: "idle",
      submit: fetcherState.submit,
    };

    await rerenderPortalSubmission(buildElement());

    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test("submits the create dialog as FormData through the fetcher", async () => {
    const nativeSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});
    const submitSpy = vi.fn();

    portalSubmissionRouterMocks.useFetcher.mockReturnValue({
      data: undefined,
      state: "idle",
      submit: submitSpy,
    });
    portalSubmissionRouterMocks.useNavigation.mockReturnValue({
      formData: undefined,
      state: "idle",
    });
    portalSubmissionRouterMocks.useSubmit.mockReturnValue(vi.fn());

    await renderPortalSubmission(
      <MemoryRouter initialEntries={["/portal/profesores"]}>
        <PortalProfessorsListRouteView
          loaderData={buildProfessorLoaderData()}
        />
      </MemoryRouter>,
    );

    await clickButton("Nuevo profesor");

    const form = document.querySelector("form");
    const firstNameInput = document.querySelector('input[name="firstName"]');
    const lastNameInput = document.querySelector('input[name="lastName"]');

    expect(form).toBeInstanceOf(HTMLFormElement);
    expect(firstNameInput).toBeInstanceOf(HTMLInputElement);
    expect(lastNameInput).toBeInstanceOf(HTMLInputElement);

    await updatePortalSubmissionForm(() => {
      setInputValue(firstNameInput as HTMLInputElement, "Ana");
      setInputValue(lastNameInput as HTMLInputElement, "Paz");
      (form as HTMLFormElement).requestSubmit(getButton("Guardar"));
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
});

function buildProfessorLoaderData(): Parameters<
  typeof PortalProfessorsListRouteView
>[0]["loaderData"] {
  return {
    professors: [],
  };
}
