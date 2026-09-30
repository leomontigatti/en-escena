/** @vitest-environment jsdom */

import { act } from "react";
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useActionData,
  useLoaderData,
} from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import type { loadPortalProfile } from "@/features/portal/profile/server";
import type { PortalProfileActionData } from "@/features/portal/profile/shared";
import { PortalProfileRouteView } from "@/features/portal/profile/view";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  setInputValue,
  updateReactDomForm,
  waitFor,
} from "@/lib/test-support/react-dom";

type ProfileLoaderData = Awaited<ReturnType<typeof loadPortalProfile>>;

const renderer = createReactDomTestRenderer();

afterEach(renderer.cleanup);

describe("the portal profile as one draft", () => {
  test("holds `Guardar` until something changes, and `Descartar cambios` puts it back", async () => {
    await renderProfilePage();

    expect(isSaveEnabled()).toBe(false);
    expect(findButton("Descartar cambios")).toBeUndefined();

    await typeContactName("Mora Díaz");

    expect(isSaveEnabled()).toBe(true);

    await clickReactDomButton("Descartar cambios");

    expect(getContactNameInput().value).toBe("Ana Paz");
    expect(isSaveEnabled()).toBe(false);
    expect(findButton("Descartar cambios")).toBeUndefined();
  });

  test("asks before leaving with changes, and lets `Volver` through once clean", async () => {
    const page = await renderProfilePage();

    await typeContactName("Mora Díaz");
    await clickLink("Volver");

    expect(findDialog()).toBeDefined();
    expect(page.pathname()).toBe("/");

    await clickReactDomButton("Seguir editando");

    expect(findDialog()).toBeUndefined();

    await clickReactDomButton("Descartar cambios");
    await clickLink("Volver");

    expect(findDialog()).toBeUndefined();
    expect(page.pathname()).toBe("/portal");
  });

  test("saves wherever an earlier test file left the shared window (#1338)", async () => {
    // `unit-shared` runs every file of a worker in one jsdom window, and the
    // admin detail tests leave its address on their own page.
    window.history.replaceState(
      null,
      "",
      "/administracion/academias/academy_1",
    );
    const saved: string[] = [];
    await renderProfilePage({
      save: (contactName) => {
        saved.push(contactName);
        return { message: "Perfil actualizado.", status: "success" };
      },
    });

    await typeContactName("Mora Díaz");
    await clickReactDomButton("Guardar");
    await waitFor(() => !isSaveEnabled());

    expect(saved).toEqual(["Mora Díaz"]);
  });

  test("leaves the form clean after a save, and keeps `Guardar` on after a refusal", async () => {
    const page = await renderProfilePage({
      save: (contactName) =>
        contactName === "Mora Díaz"
          ? { message: "Perfil actualizado.", status: "success" }
          : {
              fieldErrors: { contactName: "No válido." },
              message: "Revisá los datos.",
              status: "error",
              values: { contactName, name: "Academia", phone: "1155550000" },
            },
    });

    await typeContactName("X");
    await clickReactDomButton("Guardar");
    await settle();

    expect(getContactNameInput().value).toBe("X");
    expect(isSaveEnabled()).toBe(true);

    await typeContactName("Mora Díaz");
    await clickReactDomButton("Guardar");
    await settle();

    expect(isSaveEnabled()).toBe(false);

    await clickLink("Volver");

    expect(findDialog()).toBeUndefined();
    expect(page.pathname()).toBe("/portal");
  });
});

async function renderProfilePage(
  input: {
    save?: (contactName: string) => PortalProfileActionData;
  } = {},
) {
  let contactName = "Ana Paz";

  function Page() {
    return (
      <PortalProfileRouteView
        actionData={useActionData() as PortalProfileActionData}
        loaderData={useLoaderData() as ProfileLoaderData}
      />
    );
  }

  // The form posts to the URL the document says, which the memory router does
  // not set. The window is shared by every file of a `unit-shared` worker, so
  // its address is whatever the last one left: put it where this page sits.
  window.history.replaceState(null, "", "/");

  const router = createMemoryRouter(
    [
      { element: <Link to="/">Perfil</Link>, path: "/portal" },
      {
        action: async ({ request }) => {
          const submitted = String(
            (await request.formData()).get("contactName"),
          );
          const result = input.save?.(submitted) ?? {
            message: "Perfil actualizado.",
            status: "success",
          };

          if (result.status === "success") {
            contactName = submitted;
          }

          return result;
        },
        element: <Page />,
        loader: () =>
          ({
            academy: { contactName, name: "Academia", phone: "1155550000" },
            email: "academia@example.com",
          }) as ProfileLoaderData,
        path: "/",
      },
    ],
    { initialEntries: ["/"] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
  await settle();

  return { pathname: () => router.state.location.pathname };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function getContactNameInput() {
  const input = document.querySelector<HTMLInputElement>(
    'input[name="contactName"]',
  );

  if (!input) {
    throw new Error("The contact name field is not in the DOM.");
  }

  return input;
}

async function typeContactName(value: string) {
  await updateReactDomForm(() => {
    setInputValue(getContactNameInput(), value);
  });
  await settle();
}

function isSaveEnabled() {
  const button = findButton("Guardar", { exact: true });

  return button !== undefined && !(button as HTMLButtonElement).disabled;
}

function findDialog() {
  return (
    document.querySelector<HTMLElement>('[role="alertdialog"]') ?? undefined
  );
}

async function clickLink(text: string) {
  const link = Array.from(document.querySelectorAll("a")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );

  if (!link) {
    throw new Error(`Expected a "${text}" link.`);
  }

  await act(async () => {
    link.dispatchEvent(
      new MouseEvent("click", { bubbles: true, button: 0, cancelable: true }),
    );
    await Promise.resolve();
  });
  await settle();
}
