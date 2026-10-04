import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { AdminShell } from "@/components/admin/shell";

function navigationLinks(canWrite: boolean) {
  const markup = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/administracion"]}>
      <AdminShell
        account={{ name: "Ana", roleLabel: "Auditor", username: "ana" }}
        canWrite={canWrite}
        events={[]}
        selectedEventId={null}
      />
    </MemoryRouter>,
  );
  return [...markup.matchAll(/href="(\/administracion[^"]*)"/g)].map(
    (match) => match[1],
  );
}

describe("the administration navigation", () => {
  test("shows an auditor exactly the sections reviewed for them", () => {
    expect(navigationLinks(false).sort()).toEqual(
      [
        "/administracion",
        "/administracion/academias",
        "/administracion/bailarines",
        "/administracion/coreografias",
        "/administracion/pagos",
        "/administracion/profesores",
      ].sort(),
    );
  });

  test("shows an administrator every section, as before", () => {
    expect(navigationLinks(true)).toEqual(
      expect.arrayContaining([
        "/administracion/eventos",
        "/administracion/presentaciones",
        "/administracion/resultados",
        "/administracion/seminarios",
        "/administracion/finanzas",
        "/administracion/comprobantes",
        "/administracion/modalidades",
        "/administracion/categorias",
        "/administracion/cronogramas",
        "/administracion/precios",
        "/administracion/usuarios",
        "/administracion/academias",
        "/administracion/bailarines",
        "/administracion/profesores",
        "/administracion/coreografias",
        "/administracion/pagos",
      ]),
    );
  });
});
