import { AccessSecondaryLink } from "@/components/access-ui";
import { PortalEmptyListSection, PortalShell } from "@/components/portal-ui";
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
      <PortalEmptyListSection
        title="Profesores"
        description="Esta lista muestra solo los profesores cargados por tu academia."
        emptyTitle="Todavía no cargaste profesores"
        emptyDescription="Cuando cargues profesores, van a aparecer en esta lista para vincularlos a coreografías."
      />

      <AccessSecondaryLink to="/portal" className="mt-8">
        Volver al inicio
      </AccessSecondaryLink>
    </PortalShell>
  );
}

export default PortalProfesoresRouteView;
