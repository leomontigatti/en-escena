// PROTOTYPE — throwaway, lives only on branch `prototype/913-program-pages`
// (wayfinder ticket #913, map #907). The academy's read-only presentations page:
// the same list as `/programa` without the academy column, plus the notices only
// the portal can give (what the program hides, and why). Notice copy and the
// `Estado` badges follow the admin participation list of #912.
import { Info, SquareArrowOutUpRight, TriangleAlert } from "lucide-react";
import { Link } from "react-router";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { AlertStack } from "@/components/shared/alert-stack";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { readOwnAcademyRows } from "@/features/public/program/prototype/program-fixtures.prototype";
import { ProgramList } from "@/features/public/program/prototype/program-views.prototype";

export const portalCaseIds = [
  "publicado",
  "oculto",
  "sin-ordenar",
  "sin-elegibles",
  "sin-evento",
] as const;

export type PortalCaseId = (typeof portalCaseIds)[number];

export const portalCaseLabels: Record<PortalCaseId, string> = {
  publicado: "Programa publicado",
  oculto: "Ordenado, sin publicar",
  "sin-ordenar": "Todavía sin ordenar",
  "sin-elegibles": "Academia sin presentaciones",
  "sin-evento": "Sin evento activo",
};

export function PortalPresentationsPrototype({
  caseId,
  withNotices,
}: {
  caseId: PortalCaseId;
  withNotices: boolean;
}) {
  const rows = readOwnAcademyRows({ withNotices });
  // The portal lists every row: what the public program hides below `Señada`
  // stays here with its `Seña pendiente` badge, so the academy can fix it.
  const belowDepositCount = rows.filter((row) => row.isBelowDeposit).length;
  const programVisible = caseId === "publicado";
  const hasRows =
    (caseId === "publicado" || caseId === "oculto") && rows.length > 0;

  return (
    <PortalListPage
      titleId="presentaciones-title"
      title="Presentaciones"
      description="Consultá el número y el cronograma con el que presenta cada coreografía de tu academia en el evento activo."
      action={
        programVisible ? (
          <Button asChild variant="outline">
            <Link to="/prototipo/programa">
              <SquareArrowOutUpRight
                aria-hidden="true"
                data-icon="inline-start"
              />
              Ver programa completo
            </Link>
          </Button>
        ) : null
      }
    >
      {hasRows ? (
        <>
          <AlertStack>
            {programVisible ? null : (
              <Alert variant="info">
                <Info aria-hidden="true" />
                <AlertDescription>
                  El programa del evento todavía no se publicó. Los números
                  pueden cambiar hasta que la organización lo publique.
                </AlertDescription>
              </Alert>
            )}

            {belowDepositCount > 0 ? (
              <Alert variant="warning">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>
                  {belowDepositCount === 1
                    ? "Existe 1 coreografía con la seña pendiente que no aparece en el programa publicado."
                    : `Existen ${belowDepositCount} coreografías con la seña pendiente que no aparecen en el programa publicado.`}
                </AlertDescription>
                <AlertAction className="top-1/2 -translate-y-1/2">
                  <Button asChild size="sm" variant="link">
                    <Link to="/portal/finanzas">
                      <SquareArrowOutUpRight
                        aria-hidden="true"
                        data-icon="inline-start"
                      />
                      Ver finanzas
                    </Link>
                  </Button>
                </AlertAction>
              </Alert>
            ) : null}
          </AlertStack>

          <ProgramList
            rows={rows}
            showAcademy={false}
            choreographyPath={(row) => `/portal/coreografias/${row.id}`}
          />
        </>
      ) : (
        <PortalEmptyState {...emptyStateCopy(caseId)} />
      )}
    </PortalListPage>
  );
}

function emptyStateCopy(caseId: PortalCaseId) {
  switch (caseId) {
    case "sin-evento":
      return {
        title: "No hay un evento activo",
        description:
          "Cuando la organización active un evento vas a ver acá las presentaciones de tu academia.",
      };
    case "sin-ordenar":
      return {
        title: "Todavía no hay orden de presentaciones",
        description:
          "Cuando la organización ordene el evento vas a ver acá el número de cada coreografía.",
      };
    default:
      return {
        title: "Tu academia no tiene presentaciones",
        description:
          "Una coreografía entra en el programa cuando cubre su seña y tiene categoría.",
      };
  }
}
