// PROTOTYPE (#223, #1152) — throwaway, never merge. The admin scores view of
// one presentation, over the real choreography and made-up scores.

import { redirect } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  PrototypeScoresView,
  type PrototypeScoresLoaderData,
} from "@/features/admin/presentations/prototype-scores";
import {
  buildPrototypeScores,
  formatPrototypeDetails,
  getPrototypeEvaluationStatus,
  numberRowsInMemory,
} from "@/features/judging/prototype/results-fixtures";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { readParticipationRows } from "@/lib/presentations/participation.server";

import type { Route } from "./+types/administracion.presentacion_.$choreographyId.puntajes";

export const meta: Route.MetaFunction = () => [
  { title: "Puntajes | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Presentación", to: "/administracion/presentacion" },
    (match) => {
      const data = match.data as PrototypeScoresLoaderData | undefined;
      return data ? { label: data.title } : null;
    },
  ],
} satisfies AdminRouteHandle;

// fallow-ignore-next-line complexity -- PROTOTYPE (#223): throwaway, untested by design.
export async function loader({
  request,
  params,
}: Route.LoaderArgs): Promise<PrototypeScoresLoaderData> {
  const user = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(request);
  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }
  if (!eventContext.selectedEventId) {
    throw new Response("Not found", { status: 404 });
  }

  const rows = numberRowsInMemory(
    await readParticipationRows(eventContext.selectedEventId),
  );
  const row = rows.find(
    (candidate) => candidate.choreographyId === params.choreographyId,
  );
  const status = getPrototypeEvaluationStatus(row?.orderNumber ?? null);
  if (!row || row.orderNumber === null || status === null) {
    throw new Response("Not found", { status: 404 });
  }
  const isSheet = row.modalityName.startsWith("Acrobacias");

  return {
    canEdit: user.role === "admin",
    choreographyId: row.choreographyId,
    details: formatPrototypeDetails(row),
    isDisqualified: status === "descalificada",
    isSheet,
    orderNumber: row.orderNumber,
    scores: buildPrototypeScores({ orderNumber: row.orderNumber, isSheet }),
    selectedEventId: eventContext.selectedEventId,
    title: `N.º ${row.orderNumber} · ${row.name}`,
  };
}

export default function PresentationScoresRoute({
  loaderData,
}: Route.ComponentProps) {
  return (
    <PrototypeScoresView
      key={loaderData.choreographyId}
      loaderData={loaderData}
    />
  );
}
