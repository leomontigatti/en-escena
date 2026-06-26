import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { getPortalShellEventContext } from "@/lib/portal/event-context.server";

export async function loadPortalShell(request: Request) {
  const { user, academy } = await requireAcademyUser(request);
  const eventContext = await getPortalShellEventContext(request);

  return {
    email: user.email,
    academy,
    eventContext,
  };
}
