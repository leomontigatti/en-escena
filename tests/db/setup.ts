import { getTestDatabaseUrl } from "./config";

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.TEST_ACCESS_AUTH_SECRET ??= "test-access-auth-secret";

// Fija el baseURL de Better Auth a http para que la suite sea determinística sin
// importar el `.env` de cada dev. Con un baseURL https (p.ej. apuntando a
// producción), Better Auth activa `useSecureCookies` y prefija la cookie de
// sesión con `__Secure-`, lo que rompía 31 tests de auth en local (#501).
// Asignación dura, no `??=`: el `.env` no debe poder cambiar el resultado.
process.env.BETTER_AUTH_URL = "http://localhost:5173";
process.env.APP_URL = "http://localhost:5173";
