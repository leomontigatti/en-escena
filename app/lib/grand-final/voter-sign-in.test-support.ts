import {
  createVoterSignIn,
  type VoterIdentityProvider,
} from "@/lib/grand-final/voter-sign-in.server";

export const redirectUri = "http://localhost/votar/google/retorno";

/**
 * A provider that vouches for whoever the test names, and remembers the PKCE
 * verifier the finish handed it, so the test can check it is the start's.
 */
export function createFakeProvider(
  identity: { email: string | null; subject: string } | null = {
    email: "Votante@Example.com",
    subject: "google-sujeto-1",
  },
) {
  const exchanges: { code: string; codeVerifier: string }[] = [];
  const provider: VoterIdentityProvider = {
    name: "google",
    createAuthorizationUrl: async (input) => {
      const url = new URL("https://proveedor.test/autorizar");
      url.searchParams.set("state", input.state);
      url.searchParams.set("redirect_uri", input.redirectUri);
      url.searchParams.set("verifier", input.codeVerifier);

      return url;
    },
    readIdentity: async (input) => {
      exchanges.push({ code: input.code, codeVerifier: input.codeVerifier });

      return identity;
    },
  };

  return { exchanges, provider };
}

export function setup(
  options: {
    identity?: { email: string | null; subject: string } | null;
    now?: () => number;
  } = {},
) {
  const fake = createFakeProvider(options.identity);
  const signIn = createVoterSignIn({
    now: options.now,
    provider: fake.provider,
    secret: "secreto-de-prueba",
    secure: false,
  });

  return { ...fake, signIn };
}

/** The `Cookie` header a browser sends back after these `Set-Cookie`s. */
export function cookieHeaderFrom(setCookies: string[]) {
  return setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

/** Starts the sign-in, and answers the provider's callback request. */
export async function startThenReturn(
  signIn: ReturnType<typeof setup>["signIn"],
  callback: (state: string) => Record<string, string> = (state) => ({
    code: "codigo-del-proveedor",
    state,
  }),
) {
  const started = await signIn.startSignIn({ redirectUri });
  const location = new URL(started.headers.get("Location") ?? "");
  const query = new URLSearchParams(
    callback(location.searchParams.get("state") ?? ""),
  );

  return {
    location,
    request: new Request(`${redirectUri}?${query}`, {
      headers: { Cookie: cookieHeaderFrom(started.headers.getSetCookie()) },
    }),
    started,
  };
}
