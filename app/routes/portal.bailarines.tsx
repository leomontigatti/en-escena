import { AccessSecondaryLink } from "@/components/access-ui";
import { PortalEmptyList, PortalShell } from "@/components/portal-ui";
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
      <section className="mt-8" aria-labelledby="bailarines-title">
        <div>
          <p
            id="bailarines-title"
            className="text-sm font-semibold text-slate-950"
          >
            Bailarines
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Esta lista muestra solo los bailarines cargados por tu academia.
          </p>
        </div>
        <PortalEmptyList
          title="Todavía no cargaste bailarines"
          description="Cuando cargues bailarines, van a aparecer en esta lista para usarlos en coreografías."
        />
      </section>

      <AccessSecondaryLink to="/portal" className="mt-8">
        Volver al inicio
      </AccessSecondaryLink>
    </PortalShell>
  );
}

export default PortalBailarinesRouteView;
