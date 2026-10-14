import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { academies, individuals } from "@/db/schema";
import {
  handleIndividualPersonalDataAction,
  loadIndividualPersonalData,
} from "@/features/individual/personal-data/server";
import {
  createPortalPostRequest,
  expectThrownResponse,
} from "@/features/portal/test-support/db";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createIndividualUser } from "@/lib/test-support/individuals";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

const misDatosUrl = "http://localhost/particular/mis-datos";

describe("the individual's `Mis datos`", () => {
  test("loads the individual's personal data, its phone and its access email", async () => {
    const individual = await createIndividualUser({
      documentNumber: "30123456",
      email: "particular@example.com",
      firstName: "Ana",
      lastName: "Pérez",
      phone: "3511234567",
    });

    await expect(
      loadIndividualPersonalData(
        new Request(misDatosUrl, { headers: { cookie: individual.cookie } }),
      ),
    ).resolves.toEqual({
      email: "particular@example.com",
      values: {
        documentNumber: "30123456",
        documentType: "dni",
        firstName: "Ana",
        lastName: "Pérez",
        phone: "3511234567",
      },
    });
  });

  test("saves the name, the document normalized and the phone, and renames the owner row", async () => {
    const individual = await createIndividualUser({
      email: "particular@example.com",
    });

    const result = await handleIndividualPersonalDataAction(
      createPortalPostRequest(
        misDatosUrl,
        individual.cookie,
        personalDataForm({
          documentNumber: " 40 111.222 ",
          documentType: "dni",
          firstName: "maría  josé",
          lastName: "del valle",
          phone: "1198765432",
        }),
      ),
    );

    expect(result).toEqual({ status: "success", message: "Datos guardados." });
    await expect(
      db.query.individuals.findFirst({
        columns: {
          documentNumber: true,
          documentType: true,
          firstName: true,
          lastName: true,
        },
        where: eq(individuals.id, individual.individualId),
      }),
    ).resolves.toEqual({
      documentNumber: "40111222",
      documentType: "dni",
      firstName: "María José",
      lastName: "del Valle",
    });
    await expect(
      db.query.academies.findFirst({
        columns: { contactName: true, kind: true, name: true, phone: true },
        where: eq(academies.id, individual.ownerId),
      }),
    ).resolves.toEqual({
      contactName: "María José del Valle",
      kind: "individual",
      name: "María José del Valle",
      phone: "1198765432",
    });
  });

  test("returns the field errors with what was typed and saves nothing", async () => {
    const individual = await createIndividualUser({
      email: "particular@example.com",
      firstName: "Ana",
    });
    const typed = {
      documentNumber: "",
      documentType: "dni",
      firstName: "...",
      lastName: "Pérez",
      phone: "11 9999 0000",
    };

    const result = await handleIndividualPersonalDataAction(
      createPortalPostRequest(
        misDatosUrl,
        individual.cookie,
        personalDataForm(typed),
      ),
    );

    expect(result).toEqual({
      status: "error",
      message: "Revisá los datos del formulario.",
      fieldErrors: {
        documentNumber: "Ingresá el número de documento.",
        firstName: "Ingresá al menos una letra o un número.",
        phone: "Ingresá 10 dígitos, sin espacios, 0 ni 15.",
      },
      values: typed,
    });
    await expect(
      db.query.individuals.findFirst({
        columns: { documentNumber: true, firstName: true },
        where: eq(individuals.id, individual.individualId),
      }),
    ).resolves.toEqual({ documentNumber: "30123456", firstName: "Ana" });
  });

  test("refuses an academy, which has no personal data here", async () => {
    const academy = await createAcademyUser({
      academyName: "Academia Propia",
      email: "academia@example.com",
    });

    await expectThrownResponse(
      handleIndividualPersonalDataAction(
        createPortalPostRequest(
          misDatosUrl,
          academy.cookie,
          personalDataForm({
            documentNumber: "30123456",
            documentType: "dni",
            firstName: "Ana",
            lastName: "Pérez",
            phone: "3511234567",
          }),
        ),
      ),
      403,
    );
  });
});

function personalDataForm(values: Record<string, string>) {
  const formData = new FormData();

  for (const [name, value] of Object.entries(values)) {
    formData.set(name, value);
  }

  return formData;
}
