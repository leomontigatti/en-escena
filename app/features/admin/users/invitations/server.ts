import { redirect } from "react-router";

import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";

import { internalInvitationRedirectPath } from "./shared";

export async function loader({ request }: { request: Request }) {
  await requireAdminPanelUser(request);

  throw redirect(internalInvitationRedirectPath);
}

export async function action({ request }: { request: Request }) {
  await requireAdminPanelUser(request);

  throw redirect(internalInvitationRedirectPath);
}
