// PROTOTYPE — throwaway, lives only on branch `prototype/913-program-pages`
// (wayfinder ticket #913, map #907). The academy's read-only presentations page:
// the same layouts as `/programa` without the academy column, plus the notices
// only the portal can give (what the program hides, and why).
import { CircleAlert, ExternalLink, Info } from "lucide-react";
import { Link } from "react-router";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { AlertStack } from "@/components/shared/alert-stack";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProgramVariant } from "@/features/public/program/prototype/program-views.prototype";
import {
  readOwnAcademyRows,
  type PrototypeVariantId,
} from "@/features/public/program/prototype/program-fixtures.prototype";

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

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

export function PortalPresentationsPrototype({
  caseId,
  variant,
  withNotices,
}: {
  caseId: PortalCaseId;
  variant: PrototypeVariantId;
  withNotices: boolean;
}) {
  const allRows = readOwnAcademyRows({ withNotices });
  const shownRows = allRows.filter(
    (row) => row.orderNumber !== null && !row.isBelowDeposit,
  );
  const belowDepositCount = allRows.filter((row) => row.isBelowDeposit).length;
  const unplacedCount = allRows.filter(
    (row) => row.orderNumber === null,
  ).length;
  const programVisible = caseId === "publicado";
  const hasRows =
    (caseId === "publicado" || caseId === "oculto") && shownRows.length > 0;

  return (
    <PortalListPage
      titleId="presentaciones-title"
      title="Presentaciones"
      description="Consultá el número y el cronograma con el que presenta cada coreografía de tu academia en el evento activo."
      action={
        programVisible ? (
          <Button asChild variant="outline">
            <Link to="/prototipo/programa">
              <ExternalLink aria-hidden="true" data-icon="inline-start" />
              Ver programa completo
            </Link>
          </Button>
        ) : null
      }
    >
      {hasRows ? (
        <>
          <AlertStack>
            {caseId === "oculto" ? (
              <Alert variant="info">
                <Info aria-hidden="true" />
                <AlertDescription>
                  La organización todavía no publicó el programa. Los números
                  pueden cambiar hasta que lo haga.
                </AlertDescription>
              </Alert>
            ) : null}
            {belowDepositCount > 0 ? (
              <Alert variant="warning">
                <CircleAlert aria-hidden="true" />
                <AlertDescription>
                  {belowDepositCount}{" "}
                  {pluralize(
                    belowDepositCount,
                    "coreografía no aparece en el programa porque tiene la seña pendiente.",
                    "coreografías no aparecen en el programa porque tienen la seña pendiente.",
                  )}
                </AlertDescription>
                <AlertAction className="top-1/2 -translate-y-1/2">
                  <Button asChild variant="link" size="sm">
                    <Link to="/portal/finanzas">Ver finanzas</Link>
                  </Button>
                </AlertAction>
              </Alert>
            ) : null}
            {unplacedCount > 0 ? (
              <Alert variant="info">
                <Info aria-hidden="true" />
                <AlertDescription>
                  {unplacedCount}{" "}
                  {pluralize(
                    unplacedCount,
                    "coreografía todavía no tiene número de presentación. La organización se lo va a asignar.",
                    "coreografías todavía no tienen número de presentación. La organización se los va a asignar.",
                  )}
                </AlertDescription>
              </Alert>
            ) : null}
          </AlertStack>
          <ProgramVariant
            key={variant}
            variant={variant}
            rows={shownRows}
            showAcademy={false}
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
          "Una coreografía recibe su número cuando tiene la seña registrada y la organización ordena el evento.",
      };
  }
}
