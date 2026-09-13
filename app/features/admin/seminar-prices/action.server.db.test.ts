import { describe, expect, test } from "vitest";

import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import { createSavedEvent } from "@/lib/events/bases-test-fixtures.server.db";
import { listSeminarPrices } from "@/lib/seminar-prices/repository.server";
import { expectThrownResponse } from "@/lib/test-support/http";

import { handleSeminarPriceAction } from "./action.server";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

const newUrl = "http://localhost/administracion/precios/seminarios/nuevo";

async function submit(
  url: string,
  body: FormData,
  email = `${crypto.randomUUID()}@example.com`,
) {
  const { request } = await createSignedInAdminRequest({
    body,
    email,
    requestUrl: url,
    role: "admin",
  });

  return expectThrownResponse(
    handleSeminarPriceAction(request, {
      allowedIntents: [
        "create-seminar-price",
        "update-seminar-price",
        "delete-seminar-price",
      ],
    }),
    302,
  );
}

function seminarPriceBody(
  overrides: Record<string, string> = {},
  intent = "create-seminar-price",
) {
  const body = new FormData();
  const values: Record<string, string> = {
    intent,
    name: "Precio participantes",
    kind: "regular",
    forParticipants: "true",
    isOpenEnded: "true",
    paymentDeadline: "",
    amount: "20000",
    ...overrides,
  };

  for (const [field, value] of Object.entries(values)) {
    body.set(field, value);
  }

  return body;
}

describe("administrative seminar price action", () => {
  test("creates a row and lands on its detail, then edits and deletes it", async () => {
    const event = await createSavedEvent("Regional 2026", { activate: true });
    const created = await submit(newUrl, seminarPriceBody());
    const [saved] = await listSeminarPrices(event.id);

    expect(created.headers.get("location")).toBe(
      `/administracion/precios/seminarios/${saved.id}`,
    );
    expect(saved).toMatchObject({
      name: "Precio participantes",
      kind: "regular",
      forParticipants: true,
      paymentDeadline: null,
      amount: 20000,
    });

    const detailUrl = `http://localhost/administracion/precios/seminarios/${saved.id}`;

    await submit(
      detailUrl,
      seminarPriceBody(
        { id: saved.id, amount: "24000", name: "Precio de mayo" },
        "update-seminar-price",
      ),
    );

    await expect(listSeminarPrices(event.id)).resolves.toMatchObject([
      { id: saved.id, amount: 24000, name: "Precio de mayo" },
    ]);

    const deleteBody = new FormData();

    deleteBody.set("intent", "delete-seminar-price");
    deleteBody.set("id", saved.id);
    deleteBody.set("confirmDeletion", saved.id);

    const deleted = await submit(detailUrl, deleteBody);

    // The list a deleted row returns to is the seminar tab of `Precios`.
    expect(deleted.headers.get("location")).toBe(
      "/administracion/precios?lista=seminarios",
    );
    await expect(listSeminarPrices(event.id)).resolves.toEqual([]);
  });

  test("refuses a delete that was not confirmed from the detail", async () => {
    const event = await createSavedEvent("Regional 2027", { activate: true });

    await submit(newUrl, seminarPriceBody());

    const [saved] = await listSeminarPrices(event.id);
    const body = new FormData();

    body.set("intent", "delete-seminar-price");
    body.set("id", saved.id);

    const { request } = await createSignedInAdminRequest({
      body,
      email: `${crypto.randomUUID()}@example.com`,
      requestUrl: `http://localhost/administracion/precios/seminarios/${saved.id}`,
      role: "admin",
    });

    await expect(
      handleSeminarPriceAction(request, {
        allowedIntents: ["delete-seminar-price"],
      }),
    ).resolves.toMatchObject({
      status: "error",
      message: "Confirmá el borrado del precio.",
    });
    await expect(listSeminarPrices(event.id)).resolves.toHaveLength(1);
  });
});
