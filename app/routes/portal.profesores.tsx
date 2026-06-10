import { AccessSecondaryLink } from "@/components/access-ui";
import { PortalEmptyList, PortalShell } from "@/components/portal-ui";
import { requireAcademyUser } from "@/lib/internal-access.server";

type PortalProfesoresRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [
  { title: "Profesores | Portal de academias | En Escena" },
];

export async function loader({ request }: { request: Request }) {
  const { user, academy } = await requireAcademyUser(request);

  return {
    email: user.email,
    academy,
  };
}

export function PortalProfesoresRouteView({
  loaderData,
}: PortalProfesoresRouteProps) {
  return (
    <PortalShell
      email={loaderData.email}
      academyName={loaderData.academy.name}
      description={
        <>
          Gestioná los profesores de la academia antes de vincularlos a
          coreografías.
        </>
      }
    >
      <section className="mt-8" aria-labelledby="profesores-title">
        <div>
          <p
            id="profesores-title"
            className="text-sm font-semibold text-slate-950"
          >
            Profesores
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Esta lista muestra solo los profesores cargados por tu academia.
          </p>
        </div>
        <PortalEmptyList
          title="Todavía no cargaste profesores"
          description="Cuando cargues profesores, van a aparecer en esta lista para vincularlos a coreografías."
        />
      </section>

      <AccessSecondaryLink to="/portal" className="mt-8">
        Volver al inicio
      </AccessSecondaryLink>
    </PortalShell>
  );
}

export default PortalProfesoresRouteView;
