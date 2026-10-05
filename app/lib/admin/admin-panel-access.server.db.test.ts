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
import { loader as dancerDetailLoader } from "@/routes/administracion.bailarines_.$dancerId";
import { loader as choreographyDetailLoader } from "@/routes/administracion.coreografias_.$choreographyId";
import { loader as paymentDetailLoader } from "@/routes/administracion.pagos_.$paymentId";
import { loader as professorDetailLoader } from "@/routes/administracion.profesores_.$professorId";
import { seedPeriodExportFixture } from "@/features/admin/period-export/period-export.test-support";
import { loader as dancersLoader } from "@/routes/administracion.bailarines";
import { loader as choreographiesLoader } from "@/routes/administracion.coreografias";
import { loader as eventsLoader } from "@/routes/administracion.eventos";
import { loader as paymentsLoader } from "@/routes/administracion.pagos";
import { loader as newPaymentLoader } from "@/routes/administracion.pagos_.nuevo";
import { loader as professorsLoader } from "@/routes/administracion.profesores";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

/**
 * Every administration route module, the layout's children and the resource
 * routes beside it. A route added later lands in the refused set unless it is
 * reviewed for the auditor and named below.
 */
const administrationRoutes = import.meta.glob<{ loader?: ChildLoader }>(
  ["/app/routes/administracion.*.tsx", "/app/routes/administracion_.*.tsx"],
  { eager: true },
);

/**
 * The routes reviewed for the auditor (PRD #1448): the five sections and their
 * exports, then the seminar list and its export, without the seminar detail.
 */
const auditorReviewedRoutes = new Set([
  "administracion._index",
  "administracion.academias",
  "administracion.academias_.$academyId",
  "administracion.bailarines",
  "administracion.bailarines_.$dancerId",
  "administracion.profesores",
  "administracion.profesores_.$professorId",
  "administracion.coreografias",
  "administracion.coreografias_.$choreographyId",
  "administracion.pagos",
  "administracion.pagos_.$paymentId",
  "administracion.seminarios",
  "administracion_.academias.exportar",
  "administracion_.bailarines.exportar",
  "administracion_.profesores.exportar",
  "administracion_.coreografias.exportar",
  "administracion_.pagos.exportar",
  "administracion_.seminarios.exportar",
]);

const unreviewedRoutes = Object.entries(administrationRoutes).flatMap(
  ([file, module]) => {
    const id = file.replace("/app/routes/", "").replace(/\.tsx$/, "");

    return module.loader && !auditorReviewedRoutes.has(id)
      ? [{ id, loader: module.loader }]
      : [];
  },
);

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

  test("opens the dancer, professor, choreography and payment details, read-only", async () => {
    const fixture = await seedPeriodExportFixture();
    const academy = await fixture.addAcademy({ name: "Academia Lectura" });
    const dancer = await fixture.addDancer(academy.id);
    const professor = await fixture.addProfessor(academy.id);
    const choreography = await fixture.addChoreography({
      academyId: academy.id,
      professorIds: [professor.id],
    });
    await fixture.inscribe({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      registeredAt: "2026-04-10T15:00:00Z",
    });
    const paymentId = await fixture.addPayment({
      academyId: academy.id,
      amount: 1000,
      paymentDate: "2026-04-10",
    });
    const details = [
      [dancerDetailLoader, { dancerId: dancer.id }, `bailarines/${dancer.id}`],
      [
        professorDetailLoader,
        { professorId: professor.id },
        `profesores/${professor.id}`,
      ],
      [
        choreographyDetailLoader,
        { choreographyId: choreography.id },
        `coreografias/${choreography.id}`,
      ],
      [paymentDetailLoader, { paymentId }, `pagos/${paymentId}`],
    ] as const;

    for (const [child, params, path] of details) {
      const [, detail] = await openPanelScreen({
        child: child as unknown as ChildLoader,
        params,
        path: `/administracion/${path}`,
        role: "auditor",
      });

      expect(detail).toMatchObject({ canEdit: false });
    }
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

  test("finds the reviewed routes among the route modules", () => {
    const ids = Object.keys(administrationRoutes).map((file) =>
      file.replace("/app/routes/", "").replace(/\.tsx$/, ""),
    );

    expect(ids).toEqual(expect.arrayContaining([...auditorReviewedRoutes]));
    // Every section the PRD names as not reviewed is among the refused.
    expect(unreviewedRoutes.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "administracion.comprobantes",
        "administracion.eventos",
        "administracion.finanzas",
        "administracion.presentaciones",
        "administracion.resultados",
        "administracion.seminarios_.$seminarId",
        "administracion.usuarios",
        "administracion.comprobantes_.$comprobanteId.imprimir",
      ]),
    );
  });

  test.each([
    "administracion_.academias.exportar",
    "administracion_.bailarines.exportar",
    "administracion_.profesores.exportar",
    "administracion_.coreografias.exportar",
    "administracion_.pagos.exportar",
    "administracion_.seminarios.exportar",
  ])("downloads the reviewed export %s inside the layout", async (id) => {
    const fixture = await seedPeriodExportFixture();
    const academy = await fixture.addAcademy({ name: "Academia Sol" });
    const dancer = await fixture.addDancer(academy.id);
    // The seminar export has no file for an event nobody registered in.
    await fixture.addSeminarInscription({
      dancerId: dancer.id,
      registeredAt: "2026-04-10T15:00:00Z",
    });
    const child = administrationRoutes[`/app/routes/${id}.tsx`]?.loader;

    if (!child) {
      throw new Error(`Expected the ${id} route to export a loader.`);
    }

    const [, response] = await openPanelScreen({
      child,
      path: `/${id.replace(/[._]+/g, "/")}`,
      role: "auditor",
    });

    expect((response as Response).status).toBe(200);
  });

  test.each(unreviewedRoutes)(
    "refuses the auditor the unreviewed $id, by direct URL",
    async ({ id, loader }) => {
      // Any id will do: the guard answers before the record is looked up.
      const params = Object.fromEntries(
        [...id.matchAll(/\$(\w+)/g)].map(([, name]) => [
          name,
          crypto.randomUUID(),
        ]),
      );

      await expectThrownResponse(
        openPanelScreen({
          child: loader,
          params,
          path: `/${id.replace(/[._]+/g, "/")}`,
          role: "auditor",
        }),
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
