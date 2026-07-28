// Fija el baseURL de Better Auth a http para que la suite sea determinística sin
// importar el `.env` de cada dev. Con un baseURL https (p.ej. apuntando a
// producción), Better Auth activa `useSecureCookies` y prefija la cookie de
// sesión con `__Secure-`, lo que rompía 31 tests de auth en local (#501).
// Asignación dura, no `??=`: el `.env` no debe poder cambiar el resultado.
//
// Importado por los dos setups de DB (`setup.ts` y `setup-fast.ts`); el efecto
// ocurre al importar el módulo.
process.env.BETTER_AUTH_URL = "http://localhost:5173";
process.env.APP_URL = "http://localhost:5173";
