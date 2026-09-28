import { loadResultsPrint } from "@/features/admin/presentations/results-print/server";
import { ResultsPrintView } from "@/features/admin/presentations/results-print/view";

import type { Route } from "./+types/administracion_.presentacion.resultados.imprimir";

export const meta = () => [
  { title: "Resultados | Panel de administración | En Escena" },
];

// The results print, outside the administration layout: the page is the sheet,
// opened in a tab of its own from the participation list.
export async function loader({ request }: Route.LoaderArgs) {
  return await loadResultsPrint(request);
}

export default function ResultsPrintRoute({
  loaderData,
}: Route.ComponentProps) {
  return <ResultsPrintView loaderData={loaderData} />;
}
