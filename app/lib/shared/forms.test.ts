// @vitest-environment jsdom

import type { SubmitEventHandler } from "react";
import type { SubmitHandler } from "react-hook-form";
import { describe, expect, test, vi } from "vitest";

import { createValidatedRouteFormDataSubmitHandler } from "./forms";

type ArrayFormValues = {
  choreographyIds: string[];
  issueDate: string;
};

describe("createValidatedRouteFormDataSubmitHandler", () => {
  test("preserves array values as repeated FormData entries", () => {
    const htmlForm = document.createElement("form");
    htmlForm.action = "http://localhost/administracion";
    htmlForm.method = "post";
    htmlForm.innerHTML = '<input type="hidden" name="intent" value="issue" />';

    const submit = vi.fn();
    const handler = createValidatedRouteFormDataSubmitHandler<ArrayFormValues>(
      {
        handleSubmit: (onValid: SubmitHandler<ArrayFormValues>) => async () => {
          await onValid({
            choreographyIds: ["choreography-1", "choreography-2"],
            issueDate: "2026-07-02",
          });
        },
      },
      submit,
    );

    handler({
      currentTarget: htmlForm,
      preventDefault: vi.fn(),
    } as unknown as Parameters<SubmitEventHandler<HTMLFormElement>>[0]);

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
