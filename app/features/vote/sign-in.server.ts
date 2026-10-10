import { redirect } from "react-router";

import { buildVoterCallbackUrl, votePath } from "@/lib/grand-final/vote-url";
import { createDefaultVoterSignIn } from "@/lib/grand-final/voter-identity-providers.server";
import type { VoterSignIn } from "@/lib/grand-final/voter-sign-in.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";

/**
 * The two ends of a `voter`'s sign-in with Google, wired to the vote page:
 * `/votar/google` starts it, and Google returns to `/votar/google/retorno`.
 * Both answer a redirect that carries the sign-in's cookies, never cached.
 */

const noStore = { "Cache-Control": "no-store" };

/**
 * The redirect URI on `APP_URL`, the address registered with Google, falling
 * back to the request's origin as the printed QR codes do. Start and finish
 * must send the same one.
 */
function readRedirectUri(request: Request) {
  return buildVoterCallbackUrl(
    process.env.APP_URL || new URL(request.url).origin,
  );
}

export async function handleVoterSignInStart(
  request: Request,
  signIn: VoterSignIn | null = createDefaultVoterSignIn(),
) {
  if (!signIn) {
    throw new Response("El ingreso con Google no está disponible.", {
      headers: noStore,
      status: 404,
    });
  }

  return await signIn.startSignIn({ redirectUri: readRedirectUri(request) });
}

/** Back on the vote page, signed in, or with a toast saying it failed. */
export async function handleVoterSignInFinish(
  request: Request,
  signIn: VoterSignIn | null = createDefaultVoterSignIn(),
) {
  if (!signIn) {
    throw redirect(votePath, { headers: noStore });
  }

  const finished = await signIn.finishSignIn(request, {
    redirectUri: readRedirectUri(request),
  });
  const headers = new Headers(noStore);

  for (const cookie of finished.setCookies) {
    headers.append("Set-Cookie", cookie);
  }

  if (!finished.ok) {
    return await redirectWithFlashNotification(
      votePath,
      "voter-sign-in-failed",
      { headers },
    );
  }

  return redirect(votePath, { headers });
}
