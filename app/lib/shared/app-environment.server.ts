/**
 * Whether this deployment is pruebas: the copy of production at
 * `pruebas.enescena.com.ar` that runs on production data for specific tests.
 * It is a production build, so `NODE_ENV` cannot tell it apart; this marker
 * does, and everything pruebas does differently hangs off it. See
 * docs/operations/pruebas.md.
 */
export function isPruebasEnvironment(): boolean {
  return process.env.APP_ENVIRONMENT === "pruebas";
}
