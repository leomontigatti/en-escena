import { Info, SquareArrowOutUpRight, TriangleAlert } from "lucide-react";
import { Link } from "react-router";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { AlertStack } from "@/components/shared/alert-stack";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProgramList } from "@/features/program/list";

import type { PortalPresentationsLoaderData } from "./server";

/**
 * The academy's read-only view of the order: the shared program list without
 * the academy column, plus the two notices only the portal gives — that the
 * numbers can still change, and which choreographies still owe their deposit.
 */
export function PortalPresentationsListView({
  loaderData,
}: {
  loaderData: PortalPresentationsLoaderData;
}) {
  const belowDepositCount = loaderData.rows.filter(
    (row) => row.isBelowDeposit,
  ).length;
  const emptyState = selectEmptyState(loaderData);

  return (
    <PortalListPage
      titleId="presentaciones-title"
      title="Presentaciones"
      description="Consultá el número y el cronograma con el que presenta cada coreografía de tu academia en el evento activo."
      action={
        loaderData.programVisible ? (
          <Button asChild variant="outline">
            <Link to="/programa">
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
      {emptyState ? (
        <PortalEmptyState {...emptyState} />
      ) : (
        <>
          <AlertStack>
            {loaderData.programVisible ? null : (
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
                    ? "Existe 1 coreografía con la seña pendiente."
                    : `Existen ${belowDepositCount} coreografías con la seña pendiente.`}
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
            rows={loaderData.rows}
            showAcademy={false}
            showLevel
            choreographyPath={(row) =>
              `/portal/coreografias/${row.choreographyId}`
            }
          />
        </>
      )}
    </PortalListPage>
  );
}

/**
 * The three states that have nothing to list, apart because they are three
 * different answers: no event, an event nobody has ordered yet, and an event
 * ordered where this academy has no choreography in it.
 */
function selectEmptyState(loaderData: PortalPresentationsLoaderData) {
  if (!loaderData.hasActiveEvent) {
    return {
      title: "No hay un evento activo",
      description:
        "Cuando la organización active un evento vas a ver acá las presentaciones de tu academia.",
    };
  }

  if (!loaderData.isEventOrdered) {
    return {
      title: "Todavía no hay orden de presentaciones",
      description:
        "Cuando la organización ordene el evento vas a ver acá el número de cada coreografía.",
    };
  }

  if (loaderData.rows.length === 0) {
    return {
      title: "Tu academia no tiene presentaciones",
      description: "Una coreografía entra en el programa cuando cubre su seña.",
    };
  }

  return null;
}
