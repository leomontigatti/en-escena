import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { academies } from "@/db/schema";
import {
  handlePortalProfileAction,
  loadPortalProfile,
} from "@/features/portal/profile/server";
import {
  createAcademySession,
  createPortalPostRequest,
  expectThrownResponse,
} from "@/features/portal/test-support/db";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("portal profile server", () => {
  test("loads the current academy profile for the signed-in academy", async () => {
    const session = await createAcademySession({
      email: "perfil.loader@example.com",
      academyName: "Academia Perfil",
    });

    const loaderData = await loadPortalProfile(
      new Request("http://localhost/portal/perfil", {
        headers: { cookie: session.cookie },
      }),
    );

    expect(loaderData).toMatchObject({
      email: "perfil.loader@example.com",
      academy: {
        id: session.academyId,
        name: "Academia Perfil",
        contactName: "Contacto",
        phone: "1112345678",
      },
    });
  });

  test("updates the current academy contact profile and redirects with notification", async () => {
    const session = await createAcademySession({
      email: "perfil.update@example.com",
      academyName: "Academia Original",
    });

    const response = await expectThrownResponse(
      handlePortalProfileAction(
        createPortalPostRequest(
          "http://localhost/portal/perfil",
          session.cookie,
          academyProfileFormData({
            name: " Academia Manipulada ",
            contactName: " responsable nueva ",
            phone: "1199990000",
          }),
        ),
      ),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      "/portal/perfil?notificacion=perfil-guardado",
    );

    await expect(
      db.query.academies.findFirst({
        where: eq(academies.id, session.academyId),
      }),
    ).resolves.toMatchObject({
      name: "Academia Original",
      contactName: "Responsable Nueva",
      phone: "1199990000",
    });
  });

  test("returns a field error without persisting profile phone numbers with spaces", async () => {
    const session = await createAcademySession({
      email: "perfil.phone.validation@example.com",
      academyName: "Academia Sin Cambios",
    });

    const result = await handlePortalProfileAction(
      createPortalPostRequest(
        "http://localhost/portal/perfil",
        session.cookie,
        academyProfileFormData({
          name: "Academia Sin Cambios",
          contactName: "Responsable",
          phone: "11 9999 0000",
        }),
      ),
    );

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        phone: "Ingresá 10 dígitos, sin espacios, 0 ni 15.",
      },
      values: {
        phone: "11 9999 0000",
      },
    });

    await expect(
      db.query.academies.findFirst({
        where: eq(academies.id, session.academyId),
      }),
    ).resolves.toMatchObject({
      name: "Academia Sin Cambios",
      contactName: "Contacto",
      phone: "1112345678",
    });
  });

  test("returns field errors without persisting empty profile fields", async () => {
    const session = await createAcademySession({
      email: "perfil.validation@example.com",
      academyName: "Academia Sin Cambios",
    });

    const result = await handlePortalProfileAction(
      createPortalPostRequest(
        "http://localhost/portal/perfil",
        session.cookie,
        academyProfileFormData({
          name: "",
          contactName: "Responsable",
          phone: "   ",
        }),
      ),
    );

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        name: "Este campo es obligatorio.",
        phone: "Este campo es obligatorio.",
      },
      values: {
        name: "",
        contactName: "Responsable",
        phone: "   ",
      },
    });

    await expect(
      db.query.academies.findFirst({
        where: eq(academies.id, session.academyId),
      }),
    ).resolves.toMatchObject({
      name: "Academia Sin Cambios",
      contactName: "Contacto",
      phone: "1112345678",
    });
  });
});

function academyProfileFormData(input: {
  name: string;
  contactName: string;
  phone: string;
}) {
  const formData = new FormData();
  formData.set("intent", "update-academy-profile");
  formData.set("name", input.name);
  formData.set("contactName", input.contactName);
  formData.set("phone", input.phone);

  return formData;
}
