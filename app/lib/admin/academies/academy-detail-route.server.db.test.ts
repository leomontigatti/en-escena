import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { academies } from "@/db/schema";
import {
  createAcademyUser,
  createSignedInRequest,
} from "@/lib/admin/finances/finances.test-support";
import {
  AcademyDetailRouteView,
  action as detailAction,
  loader as detailLoader,
} from "@/routes/administracion.academias_.$academyId";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

const detailUrl = (academyId: string) =>
  `http://localhost/administracion/academias/${academyId}`;

function routeArgs(request: Request, academyId: string) {
  return {
    request,
    params: { academyId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/academias/:academyId",
  };
}

function renderDetail(
  loaderData: Awaited<ReturnType<typeof detailLoader>>,
  actionData?: Awaited<ReturnType<typeof detailAction>>,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/administracion/academias/:academyId",
        element: createElement(AcademyDetailRouteView, {
          actionData,
          loaderData,
        }),
      },
    ],
    { initialEntries: [`/administracion/academias/${loaderData.academy.id}`] },
  );

  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

// Las clases de Tailwind traen variantes `disabled:`, así que el estado real
// se lee del atributo (`disabled=""` en el markup del servidor).
function isFieldDisabled(markup: string, fieldName: string) {
  const tag = markup.match(
    new RegExp(`<input[^>]*name="${fieldName}"[^>]*>`),
  )?.[0];

  if (!tag) {
    throw new Error(`No se encontró el campo "${fieldName}" en el markup.`);
  }

  return / disabled=""/.test(tag);
}

async function buildFormRequest(input: {
  academyId: string;
  contactName: string;
  email: string;
  name: string;
  phone: string;
  role: "admin" | "auditor";
}) {
  const signedIn = await createSignedInRequest({
    email: input.email,
    role: input.role,
    requestUrl: detailUrl(input.academyId),
  });
  const formData = new FormData();

  formData.set("intent", "update-academy");
  formData.set("name", input.name);
  formData.set("contactName", input.contactName);
  formData.set("phone", input.phone);

  return new Request(detailUrl(input.academyId), {
    method: "POST",
    body: formData,
    headers: { cookie: signedIn.request.headers.get("cookie") ?? "" },
  });
}

describe.sequential("administracion academia detalle", () => {
  test("renders the academy contact data with save and back actions", async () => {
    const academy = await createAcademyUser({
      email: "academia.detalle@example.com",
      academyName: "Academia Norte",
    });
    const { request } = await createSignedInRequest({
      email: "admin.academia.detalle@example.com",
      role: "admin",
      requestUrl: detailUrl(academy.academy.id),
    });

    const loaderData = await detailLoader(
      routeArgs(request, academy.academy.id),
    );
    const markup = renderDetail(loaderData);

    expect(loaderData.academy.name).toBe("Academia Norte");
    expect(loaderData.academy.email).toBe("academia.detalle@example.com");
    expect(loaderData.canEdit).toBe(true);

    expect(markup).toContain("Academia Norte");
    expect(markup).toContain("Nombre de la academia");
    expect(markup).toContain("Email de acceso");
    expect(markup).toContain("Nombre de contacto");
    expect(markup).toContain("Teléfono de contacto");
    expect(markup).toContain("Guardar");
    expect(markup).toContain("Volver");
    expect(markup).toContain('href="/administracion/academias"');

    for (const fieldName of ["name", "contactName", "phone"]) {
      expect(isFieldDisabled(markup, fieldName)).toBe(false);
    }

    // La vista quedó acotada a los datos de la academia.
    expect(markup).not.toContain("Seña adeudada");
    expect(markup).not.toContain("Saldo adeudado");
    expect(markup).not.toContain("Coreografías");
    expect(markup).not.toContain("Bailarines");
  });

  test("persists the edited contact data and reports success", async () => {
    const academy = await createAcademyUser({
      email: "academia.editar@example.com",
      academyName: "Academia Sur",
    });
    const request = await buildFormRequest({
      academyId: academy.academy.id,
      contactName: "nora norte",
      email: "admin.academia.editar@example.com",
      name: "academia sur renombrada",
      phone: "3415551234",
      role: "admin",
    });

    const actionData = await detailAction(
      routeArgs(request, academy.academy.id),
    );

    expect(actionData).toEqual({
      status: "success",
      message: "Academia guardada.",
    });

    const [stored] = await db
      .select({
        contactName: academies.contactName,
        name: academies.name,
        phone: academies.phone,
      })
      .from(academies)
      .where(eq(academies.id, academy.academy.id));

    expect(stored).toEqual({
      contactName: "Nora Norte",
      name: "Academia Sur Renombrada",
      phone: "3415551234",
    });
  });

  test("keeps the submitted values and reports field errors on invalid input", async () => {
    const academy = await createAcademyUser({
      email: "academia.invalida@example.com",
      academyName: "Academia Este",
    });
    const request = await buildFormRequest({
      academyId: academy.academy.id,
      contactName: "",
      email: "admin.academia.invalida@example.com",
      name: "Academia Este",
      phone: "123",
      role: "admin",
    });

    const actionData = await detailAction(
      routeArgs(request, academy.academy.id),
    );

    expect(actionData.status).toBe("error");

    if (actionData.status !== "error") {
      throw new Error("Expected an error action result.");
    }

    expect(actionData.fieldErrors.contactName).toBeTruthy();
    expect(actionData.fieldErrors.phone).toBeTruthy();
    expect(actionData.values.name).toBe("Academia Este");

    const [stored] = await db
      .select({ contactName: academies.contactName })
      .from(academies)
      .where(eq(academies.id, academy.academy.id));

    expect(stored?.contactName).toBe("Academia Este");
  });

  test("lets an auditor read the detail without offering the save action", async () => {
    const academy = await createAcademyUser({
      email: "academia.auditor@example.com",
      academyName: "Academia Oeste",
    });
    const { request } = await createSignedInRequest({
      email: "auditor.academia@example.com",
      role: "auditor",
      requestUrl: detailUrl(academy.academy.id),
    });

    const loaderData = await detailLoader(
      routeArgs(request, academy.academy.id),
    );
    const markup = renderDetail(loaderData);

    expect(loaderData.canEdit).toBe(false);
    expect(markup).toContain("Academia Oeste");
    expect(markup).toContain("Volver");
    expect(markup).not.toContain("Guardar");

    // No alcanza con ocultar el botón: los campos también van deshabilitados.
    for (const fieldName of ["name", "contactName", "phone"]) {
      expect(isFieldDisabled(markup, fieldName)).toBe(true);
    }
  });

  test("blocks an auditor from submitting the form", async () => {
    const academy = await createAcademyUser({
      email: "academia.auditor.post@example.com",
      academyName: "Academia Centro",
    });
    const request = await buildFormRequest({
      academyId: academy.academy.id,
      contactName: "Otro Contacto",
      email: "auditor.academia.post@example.com",
      name: "Academia Centro",
      phone: "3415551234",
      role: "auditor",
    });

    await expect(
      detailAction(routeArgs(request, academy.academy.id)),
    ).rejects.toMatchObject({ status: 403 });
  });

  test("responds 404 for an unknown academy", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.academia.404@example.com",
      role: "admin",
      requestUrl: detailUrl("no-existe"),
    });

    await expect(
      detailLoader(routeArgs(request, "no-existe")),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("responds 404 when submitting for an unknown academy", async () => {
    const request = await buildFormRequest({
      academyId: "no-existe",
      contactName: "Nora Norte",
      email: "admin.academia.404.post@example.com",
      name: "Academia Fantasma",
      phone: "3415551234",
      role: "admin",
    });

    await expect(
      detailAction(routeArgs(request, "no-existe")),
    ).rejects.toMatchObject({ status: 404 });
  });
});
