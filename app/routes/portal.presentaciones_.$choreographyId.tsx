// PROTOTYPE (#223) — throwaway, never merge. The academy's evaluation detail
// of one presentation, over the real choreography and made-up scores.

import type { PortalRouteHandle } from "@/components/portal/ui";
import {
  buildPrototypeScores,
  formatPrototypeDetails,
  getPrototypePublishedResult,
  isPrototypeSheetModality,
  numberRowsInMemory,
} from "@/features/judging/prototype/results-fixtures";
import {
  PrototypeEvaluationView,
  type PrototypeEvaluationLoaderData,
} from "@/features/portal/presentations/detail/prototype-evaluation";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import { readAcademyPresentations } from "@/lib/presentations/academy-program.server";
import { readParticipationRows } from "@/lib/presentations/participation.server";

import type { Route } from "./+types/portal.presentaciones_.$choreographyId";

export const meta = () => [
  { title: "Evaluación | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Presentaciones", to: "/portal/presentaciones" },
    (match) => {
      const data = match.data as PrototypeEvaluationLoaderData | undefined;
      return data ? { label: data.title } : null;
    },
  ],
} satisfies PortalRouteHandle;

// fallow-ignore-next-line complexity -- PROTOTYPE (#223): throwaway, untested by design.
export async function loader({
  request,
  params,
}: Route.LoaderArgs): Promise<PrototypeEvaluationLoaderData> {
  const { academy } = await requireAcademyUser(request);
  const { activeEvent } = await getPortalActiveEventSummaryContext(request);
  if (!activeEvent) {
    throw new Response("Not found", { status: 404 });
  }
  const [own, participation] = await Promise.all([
    readAcademyPresentations({
      academyId: academy.id,
      eventId: activeEvent.id,
    }),
    readParticipationRows(activeEvent.id),
  ]);
  const row = numberRowsInMemory(participation).find(
    (candidate) => candidate.choreographyId === params.choreographyId,
  );
  const isOwn = own.some(
    (candidate) => candidate.choreographyId === params.choreographyId,
  );
  if (!row || !isOwn || row.orderNumber === null) {
    throw new Response("Not found", { status: 404 });
  }
  const isSheet = isPrototypeSheetModality(row.modalityName);
  const result = getPrototypePublishedResult({
    orderNumber: row.orderNumber,
    isSheet,
  });
  if (!result) {
    throw new Response("Not found", { status: 404 });
  }

  return {
    details: formatPrototypeDetails(row),
    isSheet,
    result,
    scores: buildPrototypeScores({ orderNumber: row.orderNumber, isSheet })
      // Annulled scores and judges who did not score never reach the academy.
      .filter((score) => !score.annulled && score.value !== null),
    title: `N.º ${row.orderNumber} · ${row.name}`,
  };
}

export default function PortalEvaluationRoute({
  loaderData,
}: Route.ComponentProps) {
  return <PrototypeEvaluationView loaderData={loaderData} />;
}
