import { AccessSecondaryLink } from "@/components/access-ui";
import {
  PortalCoreographiesSection,
  PortalShell,
} from "@/components/portal-ui";
import { requireAcademyUser } from "@/lib/internal-access.server";
import { getPortalEventContext } from "@/lib/portal-event-context.server";

type PortalCoreografiasRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [
  { title: "Coreografías | Portal de academias | En Escena" },
];

export async function loader({ request }: { request: Request }) {
  const { user, academy } = await requireAcademyUser(request);
  const eventContext = await getPortalEventContext(request);

  return {
    email: user.email,
    academy,
    eventContext,
  };
}

export function PortalCoreografiasRouteView({
  loaderData,
}: PortalCoreografiasRouteProps) {
  return (
    <PortalShell
      email={loaderData.email}
      academyName={loaderData.academy.name}
      description={
        <>
          Consultá las coreografías de la academia según el Evento consultado.
        </>
      }
    >
      <PortalCoreographiesSection eventContext={loaderData.eventContext} />

      <AccessSecondaryLink to="/portal" className="mt-8">
        Volver al inicio
      </AccessSecondaryLink>
    </PortalShell>
  );
}

export default PortalCoreografiasRouteView;
