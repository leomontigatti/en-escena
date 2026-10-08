/**
 * Whether this deployment is staging: the copy of production at
 * `pruebas.enescena.com.ar` that runs on production data for specific tests.
 * It is a production build, so `NODE_ENV` cannot tell it apart; this marker
 * does, and everything staging does differently hangs off it. See
 * docs/operations/staging.md.
 */
export function isStagingEnvironment(): boolean {
  return process.env.APP_ENVIRONMENT === "staging";
}

/**
 * The commit this deployment runs. Coolify sets `SOURCE_COMMIT` in the
 * container (see docs/operations/infrastructure.md); anywhere it is unset,
 * such as `pnpm dev`, the release is `unknown`.
 */
export function readRelease(): string {
  return process.env.SOURCE_COMMIT || "unknown";
}
