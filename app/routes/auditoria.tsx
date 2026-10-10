import { handleAuditAction, loadAuditPage } from "@/features/audit/server";
import { AuditPageView } from "@/features/audit/view";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/auditoria";

export const meta = () => [
  { title: "Gran final | Auditoría | En Escena" },
  // The page never sends its address onward, whatever the link clicked.
  { name: "referrer", content: "no-referrer" },
  { name: "robots", content: "noindex, nofollow" },
];

// The loader's and the action's headers reach the page itself: it holds the
// browser's audit session and totals nobody else may see.
export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return actionHeaders.has("Cache-Control") ? actionHeaders : loaderHeaders;
}

export async function loader({ request }: Route.LoaderArgs) {
  return await loadAuditPage(request);
}

export async function action({ request }: Route.ActionArgs) {
  return await handleAuditAction(request);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function AuditRoute({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  return <AuditPageView actionData={actionData} page={loaderData} />;
}
