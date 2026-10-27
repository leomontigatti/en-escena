import { z } from "zod";

import { readRelease } from "@/lib/shared/app-environment.server";
import type { SendOpsAlert } from "@/lib/shared/ops-alert.server";
import { readRequestedUrl } from "@/lib/shared/requested-url.server";
import { createRollingHourCount } from "@/lib/shared/rolling-hour-count";
import { resolveUserIdWithin } from "@/lib/shared/unexpected-error-log.server";
import { recordUnexpectedError } from "@/lib/shared/unexpected-error-store.server";

// The `[client:unexpected]` line is a route pattern, a time and a stack; a
// larger body is not one.
const MAX_BODY_BYTES = 8 * 1024;

// Exactly the fields the client line has. Nothing else is kept from the
// browser: the release and the user are the server's to say.
const clientErrorReport = z.strictObject({
  route: z.string().startsWith("/").max(500),
  at: z.string().max(40),
  stack: z.string().min(1).max(MAX_BODY_BYTES),
});

type ClientErrorIntakeDependencies = {
  resolveUserId: (request: Request) => Promise<string | null>;
  sendAlert: SendOpsAlert;
  /** The requests the server answered in the last hour. */
  countRequestsServed: () => number;
  limit: { requests: number; windowMs: number };
  alertsPerHour: number;
  outage: { addresses: number; shareOfRequests: number };
};

const HOUR_MS = 60 * 60 * 1000;
// What `fetch` throws in Chrome, Safari and Firefox when the connection drops
// under a navigation's data request, before the response or while its body is
// read: the user's network failed, no code of ours did, so the row is kept
// without its own alert. Matched as a prefix: Safari may add the host it could
// not reach. Read from the headline and from the causes the browser report
// lists under it, since React Router wraps a body that stopped mid-way.
const LOST_CONNECTION_LINES = [
  "TypeError: Failed to fetch",
  "TypeError: Load failed",
  "TypeError: NetworkError when attempting to fetch resource.",
  "TypeError: network error",
  "TypeError: Error in body stream",
];
const CAUSE_PREFIX = "Caused by: ";
const noAlert: SendOpsAlert = async () => false;
// Past this many addresses in one window the limiter refuses new ones rather
// than grow: a spread that wide is an attack, not a broken page.
const MAX_TRACKED_ADDRESSES = 10_000;

/**
 * The handler for `/internal/client-error`, where `onError` in the browser
 * sends its `[client:unexpected]` line: a same-origin JSON body under 8 KB,
 * a limited number per address. The row is stamped with the server's
 * release and the session's user and time, since the browser's own clock
 * and bundle cannot be trusted to say them.
 *
 * The same-origin check only binds browsers: anyone can forge a report with
 * the right `Origin`, and each new message is a new signature with its own
 * alert. So the alerts browser reports send share one hourly budget, and a
 * flood of forged ones is kept as rows without burying the chat, where the
 * server's own alerts go.
 */
function createClientErrorIntake({
  resolveUserId,
  sendAlert,
  limit,
  countRequestsServed,
  alertsPerHour,
  outage,
}: ClientErrorIntakeDependencies) {
  const isWithinLimit = createFixedWindowLimiter(limit);
  const isWithinAlertBudget = createFixedWindowLimiter({
    requests: alertsPerHour,
    windowMs: HOUR_MS,
  });
  const sendBudgetedAlert: SendOpsAlert = async (text) =>
    isWithinAlertBudget("client") ? sendAlert(text) : false;
  const outageWatch = createOutageWatch(outage, countRequestsServed);

  // A lost connection never alerts on its own. The server never sees a
  // request the proxy, TLS or a CSP rule broke, so lost connections from many
  // users at once are the only sign of it, and that sends the alert. Phones
  // drop some requests on any busy night, so they must also be a real share
  // of the requests the server answered.
  const watchLostConnection = async (
    request: Request,
    route: string,
  ): Promise<SendOpsAlert> => {
    const detected = outageWatch.detect(readClientAddress(request));

    if (detected) {
      // Outside the hourly budget: the watch alerts once an hour on its own,
      // and an outage must not wait behind twenty other reports.
      const delivered = await sendAlert(
        [
          `[client:lost-connection] ${route}`,
          `${outage.addresses} addresses lost the connection within the hour, ${detected.reports} lost connections against ${detected.requestsServed} requests served: check the proxy, not the code.`,
        ].join("\n"),
      );

      if (!delivered) {
        outageWatch.releaseAlert();
      }
    }

    return noAlert;
  };

  return async (request: Request): Promise<Response> => {
    if (!isSameOrigin(request)) {
      return answer(403);
    }

    if (!isWithinLimit(readClientAddress(request))) {
      return answer(429);
    }

    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return answer(415);
    }

    const body = await readCappedText(request);

    if (body === null) {
      return answer(413);
    }

    const parsed = clientErrorReport.safeParse(parseJson(body));

    if (!parsed.success) {
      return answer(400);
    }

    const sendReportAlert = isLostConnection(parsed.data.stack)
      ? await watchLostConnection(request, parsed.data.route)
      : sendBudgetedAlert;

    await recordUnexpectedError(
      {
        source: "client",
        route: parsed.data.route,
        method: null,
        userId: await resolveUserIdWithin(resolveUserId, request),
        at: new Date(),
        release: readRelease(),
        stack: parsed.data.stack,
      },
      { sendAlert: sendReportAlert },
    );

    return answer(204);
  };
}

function isLostConnection(stack: string) {
  const [headline, ...rest] = stack.split("\n");
  const causes = rest
    .filter((line) => line.startsWith(CAUSE_PREFIX))
    .map((line) => line.slice(CAUSE_PREFIX.length));

  return [headline, ...causes].some((failure) =>
    LOST_CONNECTION_LINES.some((line) => failure.startsWith(line)),
  );
}

// A browser's `fetch` always sends `Origin` on a POST, and `Sec-Fetch-Site`
// where it supports it. The scheme is left out of the comparison: TLS ends at
// the proxy, so the request says `http` where the browser said `https`.
function isSameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite && fetchSite !== "same-origin") {
    return false;
  }

  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).host === readRequestedUrl(request).host;
  } catch {
    // An `Origin` that is not a URL (`null`, from a sandboxed frame) is not
    // this site.
    return false;
  }
}

// Cloudflare names the visitor in `CF-Connecting-IP`; behind it, the socket
// address is Cloudflare's own.
function readClientAddress(request: Request) {
  const address =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  return address.includes(":") ? toIpv6Network(address) : address;
}

// One IPv6 subscriber holds a whole /64, so a limit per full address is a
// limit per request to anyone who rotates through it.
function toIpv6Network(address: string) {
  const [head, tail = ""] = address.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = address.includes("::") && tail ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups = address.includes("::")
    ? [...headGroups, ...Array(Math.max(missing, 0)).fill("0"), ...tailGroups]
    : headGroups;

  return `${groups.slice(0, 4).join(":")}::/64`;
}

// Counts the lost connections of the last hour and the distinct addresses they
// came from, over the same rolling hour as the requests served. The report
// that reaches both thresholds claims the alert, which then rests for an hour;
// an undelivered alert hands the claim to the next report.
function createOutageWatch(
  { addresses, shareOfRequests }: ClientErrorIntakeDependencies["outage"],
  countRequestsServed: () => number,
) {
  const reports = createRollingHourCount();
  const lastSeen = new Map<string, number>();
  let alertedAt: number | null = null;

  return {
    detect(address: string) {
      const now = Date.now();
      reports.add();

      for (const [seenAddress, seenAt] of lastSeen) {
        if (now - seenAt >= HOUR_MS) {
          lastSeen.delete(seenAddress);
        }
      }

      if (lastSeen.has(address) || lastSeen.size < MAX_TRACKED_ADDRESSES) {
        lastSeen.set(address, now);
      }

      if (alertedAt !== null && now - alertedAt < HOUR_MS) {
        return null;
      }

      if (lastSeen.size < addresses) {
        return null;
      }

      const lostConnections = reports.lastHour();
      const requestsServed = countRequestsServed();

      if (lostConnections < requestsServed * shareOfRequests) {
        return null;
      }

      alertedAt = now;

      return { reports: lostConnections, requestsServed };
    },
    releaseAlert() {
      alertedAt = null;
    },
  };
}

function createFixedWindowLimiter({
  requests,
  windowMs,
}: ClientErrorIntakeDependencies["limit"]) {
  const windows = new Map<string, { startedAt: number; count: number }>();

  return (key: string) => {
    const now = Date.now();

    for (const [knownKey, window] of windows) {
      if (now - window.startedAt >= windowMs) {
        windows.delete(knownKey);
      }
    }

    if (!windows.has(key) && windows.size >= MAX_TRACKED_ADDRESSES) {
      return false;
    }

    const window = windows.get(key) ?? { startedAt: now, count: 0 };
    window.count += 1;
    windows.set(key, window);

    return window.count <= requests;
  };
}

// Reads the body up to the cap, whatever `Content-Length` claims: a chunked
// body has none, and a declared one can lie.
async function readCappedText(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));

  if (declared > MAX_BODY_BYTES) {
    return null;
  }

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    received += value.byteLength;

    if (received > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Malformed JSON is refused like any other invalid report.
    return undefined;
  }
}

function answer(status: number) {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export { createClientErrorIntake };
