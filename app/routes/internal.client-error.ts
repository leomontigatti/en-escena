import type { Route } from "./+types/internal.client-error";

import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { createClientErrorIntake } from "@/lib/shared/client-error-intake.server";
import { sendOpsAlert } from "@/lib/shared/ops-alert.server";

// One page sends at most ten reports; this leaves room for several people on
// one address, such as an academy's network during an event.
const receiveClientError = createClientErrorIntake({
  resolveUserId: async (request) =>
    (await accessAuthProvider.getAccessSession(request))?.user.id ?? null,
  sendAlert: sendOpsAlert,
  limit: { requests: 60, windowMs: 10 * 60 * 1000 },
  // Past this, browser reports are kept without alerting until the hour
  // turns; the server's own errors keep alerting.
  alertsPerHour: 20,
});

/** Where `onError` in `entry.client.tsx` sends a browser's unexpected error. */
export function action({ request }: Route.ActionArgs) {
  return receiveClientError(request);
}
