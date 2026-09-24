import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { academies, dancers, user } from "@/db/schema";
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

// Tailwind's classes carry `disabled:` variants, so the real state is read from
// the attribute (`disabled=""` in the server's markup).
function isFieldDisabled(markup: string, fieldName: string) {
  const tag = markup.match(
    new RegExp(`<input[^>]*name="${fieldName}"[^>]*>`),
  )?.[0];

  if (!tag) {
    throw new Error(
      `Expected the markup to hold a field named "${fieldName}".`,
    );
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

async function buildDeleteRequest(input: {
  academyId: string;
  confirmDeletion?: string;
  email: string;
  role: "admin" | "auditor";
}) {
  const signedIn = await createSignedInRequest({
    email: input.email,
    role: input.role,
    requestUrl: detailUrl(input.academyId),
  });
  const formData = new FormData();

  formData.set("intent", "delete-academy");
  formData.set("id", input.academyId);
  formData.set("confirmDeletion", input.confirmDeletion ?? input.academyId);

  return new Request(detailUrl(input.academyId), {
    method: "POST",
    body: formData,
    headers: { cookie: signedIn.request.headers.get("cookie") ?? "" },
  });
}

describe("`/administracion/academias` detail", () => {
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

    // The view is scoped to the academy's own data.
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
      intent: "update-academy",
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

    if (
      actionData.status !== "error" ||
      actionData.intent !== "update-academy"
    ) {
      throw new Error("Expected an update error action result.");
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

    // Hiding the button is not enough: the fields are disabled too.
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

  test("deletes an empty academy with its user and redirects to the list", async () => {
    const academy = await createAcademyUser({
      email: "academia.eliminar@example.com",
      academyName: "Academia Fork",
    });
    const request = await buildDeleteRequest({
      academyId: academy.academy.id,
      email: "admin.academia.eliminar@example.com",
      role: "admin",
    });

    const response = await detailAction(
      routeArgs(request, academy.academy.id),
    ).then(
      () => {
        throw new Error("Expected the delete to redirect.");
      },
      (thrown: unknown) => thrown as Response,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/administracion/academias");

    await expect(
      db
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.id, academy.academy.id)),
    ).resolves.toEqual([]);
    await expect(
      db.select({ id: user.id }).from(user).where(eq(user.id, academy.user.id)),
    ).resolves.toEqual([]);
  });

  test("refuses to delete an academy that still holds people and changes nothing", async () => {
    const academy = await createAcademyUser({
      email: "academia.con.bailarines@example.com",
      academyName: "Academia Poblada",
    });

    await db.insert(dancers).values({
      academyId: academy.academy.id,
      firstName: "Ana",
      lastName: "Gómez",
      birthDate: "2010-01-01",
    });

    const request = await buildDeleteRequest({
      academyId: academy.academy.id,
      email: "admin.academia.poblada@example.com",
      role: "admin",
    });

    const actionData = await detailAction(
      routeArgs(request, academy.academy.id),
    );

    expect(actionData).toEqual({
      status: "error",
      intent: "delete-academy",
      message: "No se puede eliminar la academia: tiene 1 bailarín.",
    });
    await expect(
      db
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.id, academy.academy.id)),
    ).resolves.toHaveLength(1);
  });

  test("refuses a delete whose confirmation does not match the academy", async () => {
    const academy = await createAcademyUser({
      email: "academia.sin.confirmar@example.com",
      academyName: "Academia Sin Confirmar",
    });
    const request = await buildDeleteRequest({
      academyId: academy.academy.id,
      confirmDeletion: "otra-academia",
      email: "admin.academia.sin.confirmar@example.com",
      role: "admin",
    });

    await expect(
      detailAction(routeArgs(request, academy.academy.id)),
    ).resolves.toEqual({
      status: "error",
      intent: "delete-academy",
      message: "Confirmá la eliminación de la academia.",
    });
    await expect(
      db
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.id, academy.academy.id)),
    ).resolves.toHaveLength(1);
  });

  test("blocks an auditor from deleting an academy", async () => {
    const academy = await createAcademyUser({
      email: "academia.auditor.delete@example.com",
      academyName: "Academia Auditor",
    });
    const request = await buildDeleteRequest({
      academyId: academy.academy.id,
      email: "auditor.academia.delete@example.com",
      role: "auditor",
    });

    await expect(
      detailAction(routeArgs(request, academy.academy.id)),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      db
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.id, academy.academy.id)),
    ).resolves.toHaveLength(1);
  });
});
