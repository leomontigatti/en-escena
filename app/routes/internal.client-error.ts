import type { Route } from "./+types/internal.client-error";

import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { createClientErrorIntake } from "@/lib/shared/client-error-intake.server";
import { sendOpsAlert } from "@/lib/shared/ops-alert.server";
import { servedRequests } from "@/lib/shared/served-requests.server";

// One page sends at most ten reports; this leaves room for several people on
// one address, such as an academy's network during an event.
const receiveClientError = createClientErrorIntake({
  resolveUserId: async (request) =>
    (await accessAuthProvider.getAccessSession(request))?.user.id ?? null,
  sendAlert: sendOpsAlert,
  countRequestsServed: servedRequests.countLastHour,
  limit: { requests: 60, windowMs: 10 * 60 * 1000 },
  // Past this, browser reports are kept without alerting until the hour
  // turns; the server's own errors keep alerting.
  alertsPerHour: 20,
  // A lost connection alone never alerts; from this many addresses in an
  // hour, and one in a hundred of the requests served, it is an outage
  // between the browsers and the server. The `Gran Final` vote of 2026-10-25
  // lost about 60 against 39,000 served, all of them answered. The count of
  // requests served starts at zero with each container, so just after a
  // deploy, which itself drops connections, the addresses alone decide.
  outage: { addresses: 5, shareOfRequests: 0.01 },
});

/** Where `onError` in `entry.client.tsx` sends a browser's unexpected error. */
export function action({ request }: Route.ActionArgs) {
  return receiveClientError(request);
}
