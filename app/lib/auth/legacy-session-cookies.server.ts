import { parse, serialize } from "cookie";

const LEGACY_SESSION_COOKIE_PREFIX = "sb-";

// Shim de migración, no integración viva (#582). Supabase Auth dejó de ser el
// proveedor de credenciales en la consolidación forward-only sobre Better Auth
// (#266) y la salida completa de Supabase quedó registrada en ADR-0013; lo
// único que sobrevive de aquella etapa son las cookies `sb-*` que quedaron en
// el navegador de quien ingresó antes del cutover. Esta función las expira para
// que no convivan con la cookie de sesión actual.
//
// Solo afecta a navegadores con cookies previas al cutover: una instalación
// nueva nunca recibe una cookie `sb-*`. Se puede retirar —junto con la rama
// `sb-` de `access-redirects.server.ts`— una vez transcurrida la vida máxima de
// aquellas cookies, o antes si la telemetría de acceso deja de registrar
// presencia de `sb-*` en las requests.
//
// No depende de `@supabase/ssr`: parsea la cookie de la request y serializa con
// la librería `cookie` genérica.
export function createLegacySessionCookieClearHeaders(request: Request) {
  const headers = new Headers();

  for (const name of getLegacySessionCookieNames(request)) {
    headers.append(
      "set-cookie",
      serialize(name, "", {
        expires: new Date(0),
        maxAge: 0,
        path: "/",
        sameSite: "lax",
      }),
    );
  }

  return headers;
}

function getLegacySessionCookieNames(request: Request) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return [];
  }

  return Object.keys(parse(cookieHeader)).filter((name) =>
    name.startsWith(LEGACY_SESSION_COOKIE_PREFIX),
  );
}
