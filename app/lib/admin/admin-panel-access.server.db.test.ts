import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import {
  createSignedInAdminRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { loader as layoutLoader } from "@/routes/administracion";
import { loader as academyDetailLoader } from "@/routes/administracion.academias_.$academyId";
import { loader as academiesLoader } from "@/routes/administracion.academias";
import { loader as dancersLoader } from "@/routes/administracion.bailarines";
import { loader as choreographiesLoader } from "@/routes/administracion.coreografias";
import { loader as eventsLoader } from "@/routes/administracion.eventos";
import { loader as paymentsLoader } from "@/routes/administracion.pagos";
import { loader as newPaymentLoader } from "@/routes/administracion.pagos_.nuevo";
import { loader as professorsLoader } from "@/routes/administracion.profesores";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

type ChildLoader = (args: {
  context: never;
  params: Record<string, string>;
  pattern: string;
  request: Request;
  url: URL;
}) => Promise<unknown>;

/**
 * What React Router does on a navigation into the panel: the layout's loader
 * and the child's run for the same request, and either one refusing is a
 * refusal of the screen.
 */
async function openPanelScreen(input: {
  child: ChildLoader;
  params?: Record<string, string>;
  path: string;
  role: "academy" | "admin" | "auditor" | "judge";
}) {
  const url = `http://localhost${input.path}`;
  const { request } = await createSignedInAdminRequest({
    email: `${crypto.randomUUID()}@example.com`,
    requestUrl: url,
    role: input.role,
  });
  const args = {
    context: undefined as never,
    params: input.params ?? {},
    pattern: input.path,
    request,
    url: new URL(url),
  };

  return await Promise.all([
    layoutLoader({ ...args, pattern: "/administracion" }),
    input.child(args),
  ]);
}

async function insertAcademy() {
  const userId = crypto.randomUUID();

  await db.insert(user).values({
    email: `${userId}@example.com`,
    emailVerified: true,
    id: userId,
    name: "Academia Lectura",
    role: "academy",
  });
  const [academy] = await db
    .insert(academies)
    .values({
      contactName: "Responsable",
      name: "Academia Lectura",
      phone: "351 000-0000",
      userId,
    })
    .returning({ id: academies.id });

  return academy.id;
}

const readerScreens = [
  ["Academias", "/administracion/academias", academiesLoader],
  ["Bailarines", "/administracion/bailarines", dancersLoader],
  ["Profesores", "/administracion/profesores", professorsLoader],
  ["Coreografías", "/administracion/coreografias", choreographiesLoader],
  ["Pagos", "/administracion/pagos", paymentsLoader],
] as const;

describe("the administration panel for an auditor", () => {
  test.each(readerScreens)(
    "opens the %s list inside the layout",
    async (_label, path, child) => {
      const [layout] = await openPanelScreen({
        child: child as ChildLoader,
        path,
        role: "auditor",
      });

      expect(layout).toMatchObject({ canWrite: false });
    },
  );

  test("opens an academy's detail inside the layout, read-only", async () => {
    const academyId = await insertAcademy();

    const [, detail] = await openPanelScreen({
      child: academyDetailLoader as unknown as ChildLoader,
      params: { academyId },
      path: `/administracion/academias/${academyId}`,
      role: "auditor",
    });

    expect(detail).toMatchObject({ canEdit: false });
  });

  test.each([
    ["Eventos", "/administracion/eventos", eventsLoader],
    ["Nuevo pago", "/administracion/pagos/nuevo", newPaymentLoader],
  ] as const)(
    "is still refused the admin-only %s screen",
    async (_label, path, child) => {
      await expectThrownResponse(
        openPanelScreen({ child: child as ChildLoader, path, role: "auditor" }),
        403,
      );
    },
  );

  test("lets the administrator write", async () => {
    const [layout] = await openPanelScreen({
      child: academiesLoader as ChildLoader,
      path: "/administracion/academias",
      role: "admin",
    });

    expect(layout).toMatchObject({ canWrite: true });
  });

  test.each(["academy", "judge"] as const)(
    "keeps refusing the %s",
    async (role) => {
      await expectThrownResponse(
        openPanelScreen({
          child: academiesLoader as ChildLoader,
          path: "/administracion/academias",
          role,
        }),
        403,
      );
    },
  );
});
