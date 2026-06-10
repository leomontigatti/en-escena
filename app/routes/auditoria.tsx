import { AccessHeader, AccessPage } from "@/components/access-ui";
import { requireAuditorPanelUser } from "@/lib/internal-navigation.server";

import type { Route } from "./+types/auditoria";

export const meta: Route.MetaFunction = () => [
  { title: "Panel de auditoría | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAuditorPanelUser(request);

  return { email: user.email };
}

export default function AuditoriaRoute({ loaderData }: Route.ComponentProps) {
  return (
    <AccessPage width="xl">
      <AccessHeader
        eyebrow="Auditoría"
        title="Consulta interna"
        description={
          <>
            Acceso activo para{" "}
            <span className="break-words font-medium text-slate-800">
              {loaderData.email}
            </span>
            . Este espacio será de solo lectura para revisar el sistema sin
            crear, editar, publicar ni corregir datos.
          </>
        }
      />

      <div className="mt-8 rounded-lg bg-slate-50 p-5">
        <p className="text-sm font-semibold text-slate-950">
          Vistas de auditoría
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Las consultas operativas, financieras y de participación se van a
          sumar en próximas iteraciones.
        </p>
      </div>
    </AccessPage>
  );
}
