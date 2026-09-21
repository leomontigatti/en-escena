import { loadPublicProgram } from "@/features/program/public/server";
import { PublicProgramView } from "@/features/program/public/view";

type ProgramRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [{ title: "Programa | En Escena" }];

export async function loader({ request }: { request: Request }) {
  return await loadPublicProgram(request);
}

export default function ProgramRoute({ loaderData }: ProgramRouteProps) {
  return <PublicProgramView loaderData={loaderData} />;
}
