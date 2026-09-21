import { describe, expect, test } from "vitest";

import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";

import {
  handlePresentationListAction,
  loadPresentationListRouteData,
} from "./server";
import { orderAutomaticallyIntent } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const listUrl = "http://localhost/administracion/presentacion";

/**
 * The route adapter alone: who reads the participation list and who may act on
 * it. The list itself is covered by `participation.server.db.test.ts`, so these
 * ask nothing about rows — an event-less organisation answers the same shape.
 */
describe("the participation list route", () => {
  test("lets an administrator read it and gives them the actions", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.presentacion@example.com",
      requestUrl: listUrl,
      role: "admin",
    });

    await expect(loadPresentationListRouteData(request)).resolves.toMatchObject(
      { canOrder: true },
    );
  });

  test("lets an auditor read it and withholds the actions", async () => {
    const { request } = await createSignedInRequest({
      email: "auditor.presentacion@example.com",
      requestUrl: listUrl,
      role: "auditor",
    });

    await expect(loadPresentationListRouteData(request)).resolves.toMatchObject(
      { canOrder: false },
    );
  });

  test("turns an academy away from the list", async () => {
    const { request } = await createSignedInRequest({
      email: "academia.presentacion@example.com",
      requestUrl: listUrl,
      role: "academy",
    });

    await expectThrownResponse(loadPresentationListRouteData(request), 403);
  });

  test("turns an auditor away from the ordering itself", async () => {
    const body = new FormData();
    body.set("intent", orderAutomaticallyIntent);

    const { request } = await createSignedInRequest({
      body,
      email: "auditor.ordena@example.com",
      requestUrl: listUrl,
      role: "auditor",
    });

    await expectThrownResponse(handlePresentationListAction(request), 403);
  });
});
