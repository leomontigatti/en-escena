import type { AdminRouteHandle } from "@/components/admin/shell";
import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import {
  handleSeminarFinanceAction,
  loadSeminarFinanceDetail,
} from "@/features/admin/finances/academy-seminars/seminar-detail/server";
import { SeminarFinanceDetailView } from "@/features/admin/finances/academy-seminars/seminar-detail/view";

import type { Route } from "./+types/administracion.finanzas_.$academyId_.seminarios_.$seminarId";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type SeminarFinanceDetailRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Detalle financiero | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Finanzas", to: "/administracion/finanzas" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      return data?.academy
        ? {
            label: data.academy.name,
            to: `/administracion/finanzas/${data.academy.id}`,
          }
        : null;
    },
    // The instructor alone, exactly as the page titles itself: a seminar is
    // named by who teaches it on every surface of both sides.
    (match) => {
      const data = match.data as LoaderData | undefined;
      return data?.seminar ? { label: data.seminar.instructorName } : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadSeminarFinanceDetail({ request, params });
}

export async function action({ request, params }: Route.ActionArgs) {
  return await handleSeminarFinanceAction({ request, params });
}

export const shouldRevalidate = createDataTableShouldRevalidate();

export default function SeminarFinanceDetailRoute({
  loaderData,
}: SeminarFinanceDetailRouteProps) {
  return <SeminarFinanceDetailView loaderData={loaderData} />;
}
