// Pins Better Auth's baseURL to http so the suite is deterministic regardless of
// each dev's `.env`. With an https baseURL (pointing at production, for
// instance), Better Auth turns on `useSecureCookies` and prefixes the session
// cookie with `__Secure-`, which broke 31 auth tests locally (#501). A hard
// assignment, not `??=`: the `.env` must not be able to change the outcome.
//
// Imported by both DB setups (`setup.ts` and `setup-fast.ts`); the effect
// happens on module import.
process.env.BETTER_AUTH_URL = "http://localhost:5173";
process.env.APP_URL = "http://localhost:5173";
