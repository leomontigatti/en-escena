import { AccessSecondaryLink } from "@/components/access-ui";
import { PortalEmptyListSection, PortalShell } from "@/components/portal-ui";
import { requireAcademyUser } from "@/lib/internal-access.server";

type PortalBailarinesRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [
  { title: "Bailarines | Portal de academias | En Escena" },
];

export async function loader({ request }: { request: Request }) {
  const { user, academy } = await requireAcademyUser(request);

  return {
    email: user.email,
    academy,
  };
}

export function PortalBailarinesRouteView({
  loaderData,
}: PortalBailarinesRouteProps) {
  return (
    <PortalShell
      email={loaderData.email}
      academyName={loaderData.academy.name}
      description={
        <>Gestioná los bailarines de la academia antes de armar coreografías.</>
      }
    >
      <PortalEmptyListSection
        title="Bailarines"
        description="Esta lista muestra solo los bailarines cargados por tu academia."
        emptyTitle="Todavía no cargaste bailarines"
        emptyDescription="Cuando cargues bailarines, van a aparecer en esta lista para usarlos en coreografías."
      />

      <AccessSecondaryLink to="/portal" className="mt-8">
        Volver al inicio
      </AccessSecondaryLink>
    </PortalShell>
  );
}

export default PortalBailarinesRouteView;
