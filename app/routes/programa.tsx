import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import { loadPublicProgram } from "@/features/program/public/server";
import { PublicProgramView } from "@/features/program/public/view";
import { dayTabParam } from "@/lib/shared/url-tab";

type ProgramRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [{ title: "Programa | En Escena" }];

// The list is whole in the browser: its day tab and its search only narrow it.
export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [dayTabParam],
});

export async function loader({ request }: { request: Request }) {
  return await loadPublicProgram(request);
}

export default function ProgramRoute({ loaderData }: ProgramRouteProps) {
  return <PublicProgramView loaderData={loaderData} />;
}
