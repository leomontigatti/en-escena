import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Client React de Better Auth. Golpea el catch-all `/api/auth/*` en el mismo
// origen (por eso no fija `baseURL`). El `adminClient` habilita las operaciones
// de internos (crear/banear/eliminar usuarios, resetear contraseña) que se
// re-apuntan en #423.
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [adminClient()],
});
