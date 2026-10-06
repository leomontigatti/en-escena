/** @vitest-environment jsdom */

import { useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";

import {
  installPortalSubmissionTestHooks,
  portalSubmissionRouterMocks,
  renderPortalSubmission,
  updatePortalSubmissionForm,
} from "@/features/portal/test-support/submission";
import { setInputValue } from "@/lib/test-support/react-dom";

import { CreateProfessorPage } from "./page";
import type { CreateProfessorActionData } from "./shared";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

installPortalSubmissionTestHooks();

const refusal: CreateProfessorActionData = {
  status: "error",
  message: "Revisá los datos del formulario.",
  fieldErrors: {
    documentNumber: "Ya existe un profesor con ese documento en tu academia.",
  },
  values: {
    firstName: "Ana",
    lastName: "Paz",
    documentType: "dni",
    documentNumber: "30111222",
  },
};

describe("CreateProfessorPage", () => {
  test("refills what was typed after a refusal", async () => {
    await renderPage(refusal);

    expect(input("firstName").value).toBe("Ana");
    expect(input("documentNumber").value).toBe("30111222");

    await updatePortalSubmissionForm(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The refusal is the server's, so it is a toast, never on the field.
    expect(toastError).toHaveBeenCalledWith(
      "Ya existe un profesor con ese documento en tu academia.",
      expect.objectContaining({ id: "portal-profesor-nuevo:error" }),
    );
    expect(document.body.textContent).not.toContain(
      "Ya existe un profesor con ese documento en tu academia.",
    );
  });

  test("keeps what was typed when the save after a refusal crashes", async () => {
    await renderPage(refusal);
    await updatePortalSubmissionForm(() => {
      setInputValue(input("firstName"), "Analía");
    });

    await updatePortalSubmissionForm(() => {
      answer({
        status: "error",
        message: "No pudimos completar la acción. Intentá nuevamente.",
      });
    });

    expect(input("firstName").value).toBe("Analía");
    expect(input("documentNumber").value).toBe("30111222");
  });
});

type PageActionData = Parameters<typeof CreateProfessorPage>[0]["actionData"];

// The action's next answer, as the route would hand it to the mounted page.
let answer: (actionData: PageActionData) => void = () => {};

function PageUnderTest({ initial }: { initial: PageActionData }) {
  const [actionData, setActionData] = useState(initial);
  answer = setActionData;

  return <CreateProfessorPage actionData={actionData} />;
}

async function renderPage(actionData: PageActionData) {
  portalSubmissionRouterMocks.useNavigation.mockReturnValue({
    formData: undefined,
    state: "idle",
  });
  portalSubmissionRouterMocks.useSubmit.mockReturnValue(vi.fn());

  const router = createMemoryRouter(
    [
      {
        path: "/portal/profesores/nuevo",
        element: <PageUnderTest initial={actionData} />,
      },
    ],
    { initialEntries: ["/portal/profesores/nuevo"] },
  );

  await renderPortalSubmission(<RouterProvider router={router} />);
}

function input(name: string) {
  const element = document.querySelector(`input[name="${name}"]`);

  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Expected input "${name}" to be rendered.`);
  }

  return element;
}
