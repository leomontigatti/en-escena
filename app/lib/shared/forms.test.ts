// @vitest-environment jsdom

import type { SubmitEventHandler } from "react";
import type { SubmitHandler, UseFormReturn } from "react-hook-form";
import { describe, expect, test, vi } from "vitest";

import {
  createValidatedReactRouterSubmitHandler,
  createValidatedRouteFormDataSubmitHandler,
} from "./forms";

type ArrayFormValues = {
  choreographyIds: string[];
  issueDate: string;
};

function createHtmlForm({
  action,
  intent,
}: {
  action: string;
  intent: string;
}) {
  const htmlForm = document.createElement("form");

  htmlForm.action = action;
  htmlForm.method = "post";
  htmlForm.innerHTML = `<input type="hidden" name="intent" value="${intent}" />`;

  return htmlForm;
}

// Stands in for `useForm`'s return: validation is react-hook-form's job, so the
// handlers under test only need a `handleSubmit` that reaches the valid branch.
function createValidForm(
  values: ArrayFormValues,
): Pick<
  UseFormReturn<ArrayFormValues, unknown, ArrayFormValues>,
  "handleSubmit"
> {
  return {
    handleSubmit:
      (onValid: SubmitHandler<ArrayFormValues>) =>
      async (): Promise<undefined> => {
        await onValid(values);

        return undefined;
      },
  };
}

function submitHtmlForm(
  handler: SubmitEventHandler<HTMLFormElement>,
  htmlForm: HTMLFormElement,
) {
  handler({
    currentTarget: htmlForm,
    preventDefault: vi.fn(),
  } as unknown as Parameters<SubmitEventHandler<HTMLFormElement>>[0]);
}

const formValues: ArrayFormValues = {
  choreographyIds: ["choreography-1", "choreography-2"],
  issueDate: "2026-07-02",
};

describe("createValidatedRouteFormDataSubmitHandler", () => {
  test("preserves array values as repeated FormData entries", () => {
    const htmlForm = createHtmlForm({
      action: "http://localhost/administracion",
      intent: "issue",
    });
    const submit = vi.fn();

    submitHtmlForm(
      createValidatedRouteFormDataSubmitHandler<ArrayFormValues>(
        createValidForm(formValues),
        submit,
      ),
      htmlForm,
    );

    const [submission] = submit.mock.calls[0] ?? [];

    expect(submission).toBeInstanceOf(FormData);
    expect((submission as FormData).get("intent")).toBe("issue");
    expect((submission as FormData).get("issueDate")).toBe("2026-07-02");
    expect((submission as FormData).getAll("choreographyIds")).toEqual([
      "choreography-1",
      "choreography-2",
    ]);
  });
});

describe("createValidatedReactRouterSubmitHandler", () => {
  test("merges the form values into the FormData it submits", () => {
    const htmlForm = createHtmlForm({
      action: "http://localhost/portal/profesores",
      intent: "create",
    });
    const submit = vi.fn();

    submitHtmlForm(
      createValidatedReactRouterSubmitHandler<ArrayFormValues>(
        createValidForm(formValues),
        submit,
        { method: "post" },
      ),
      htmlForm,
    );

    const [submission] = submit.mock.calls[0] ?? [];

    expect(submission).toBeInstanceOf(FormData);
    expect((submission as FormData).get("intent")).toBe("create");
    expect((submission as FormData).get("issueDate")).toBe("2026-07-02");
    expect((submission as FormData).getAll("choreographyIds")).toEqual([
      "choreography-1",
      "choreography-2",
    ]);
  });

  test("forwards the submit options instead of the form's own attributes", () => {
    const htmlForm = createHtmlForm({
      action: "http://localhost/portal/bailarines",
      intent: "create",
    });
    const submit = vi.fn();

    submitHtmlForm(
      createValidatedReactRouterSubmitHandler<ArrayFormValues>(
        createValidForm(formValues),
        submit,
        { encType: "multipart/form-data", method: "post" },
      ),
      htmlForm,
    );

    const [, submitOptions] = submit.mock.calls[0] ?? [];

    expect(submitOptions).toEqual({
      encType: "multipart/form-data",
      method: "post",
    });
  });
});
