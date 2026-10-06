import { SquareArrowOutUpRight, TriangleAlert } from "lucide-react";
import { Link } from "react-router";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { AlertStack } from "@/components/shared/alert-stack";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProgramList } from "@/features/program/list";

import type { PortalPresentationsLoaderData } from "./server";

/**
 * The academy's read-only view of the order: the shared program list without
 * the academy column, plus the one notice only the portal gives — which
 * choreographies still owe their deposit. It shows the same published numbers
 * as the public program: a row of a day not published comes from the loader
 * without its number, so it reads exactly like one not placed yet.
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
  // A published row's name opens what the judges said about it; every other one
  // keeps opening the choreography. The list itself gains no results column.
  const publishedIds = new Set(
    loaderData.rows
      .filter((row) => row.isResultPublished)
      .map((row) => row.choreographyId),
  );

  return (
    <PortalListPage
      titleId="presentaciones-title"
      title="Presentaciones"
      description="Consultá el número y el cronograma con el que presenta cada coreografía de tu academia en el evento activo."
      action={
        loaderData.hasVisibleDay ? (
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
            {belowDepositCount > 0 ? (
              <Alert variant="warning">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>Seña pendiente</AlertTitle>
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
              publishedIds.has(row.choreographyId)
                ? `/portal/presentaciones/${row.choreographyId}`
                : `/portal/coreografias/${row.choreographyId}`
            }
          />
        </>
      )}
    </PortalListPage>
  );
}

/**
 * The three states that have nothing to list, apart because they are three
 * different answers: no event, an event with no published number yet, and an
 * event published where this academy has no choreography in it.
 */
function selectEmptyState(loaderData: PortalPresentationsLoaderData) {
  if (!loaderData.hasActiveEvent) {
    return {
      title: "No hay un evento activo",
      description:
        "Cuando la organización active un evento vas a ver acá las presentaciones de tu academia.",
    };
  }

  // An order with no day published is, to the academy, no order yet: it is
  // told when the numbers can be read, not that they exist.
  if (!loaderData.hasPublishedPresentations) {
    return {
      title: "Todavía no hay orden de presentaciones",
      description:
        "Cuando la organización publique el programa vas a ver acá el número de cada coreografía.",
    };
  }

  if (loaderData.rows.length === 0) {
    return {
      title: "Tu academia no tiene presentaciones",
      description:
        "Cuando tu academia inscriba una coreografía en el evento activo, va a aparecer acá.",
    };
  }

  return null;
}
