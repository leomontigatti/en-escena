import { z } from "zod";

import { readRelease } from "@/lib/shared/app-environment.server";
import type { SendOpsAlert } from "@/lib/shared/ops-alert.server";
import { readRequestedUrl } from "@/lib/shared/requested-url.server";
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
  limit: { requests: number; windowMs: number };
  alertsPerHour: number;
};

const HOUR_MS = 60 * 60 * 1000;
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
  alertsPerHour,
}: ClientErrorIntakeDependencies) {
  const isWithinLimit = createFixedWindowLimiter(limit);
  const isWithinAlertBudget = createFixedWindowLimiter({
    requests: alertsPerHour,
    windowMs: HOUR_MS,
  });
  const sendBudgetedAlert: SendOpsAlert = async (text) =>
    isWithinAlertBudget("client") ? sendAlert(text) : false;

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
      { sendAlert: sendBudgetedAlert },
    );

    return answer(204);
  };
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
