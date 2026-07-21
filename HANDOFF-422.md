# Handoff — #422: cutover de tests a Better Auth real (retirar test provider)

> **SCRATCH / temporal.** Este archivo es un handoff para implementar #422 en una
> sesión nueva. **Borralo antes de mergear** el PR #433.

## Contexto

- **Issue:** #422 (sub-issue 3/5 del PRD **#420**, "Build fase Auth"). Diseño canónico: **#297**; scope de origen: **#266**.
- **Rama compartida del PRD:** `agent/prd-420-prd-build-fase-auth-supabase-auth-gotrue-better-au`. **Trabajá acá** (no en master).
- **PR draft abierto:** #433. Se actualiza al pushear a la rama.
- **Ya banqueado en la rama:** #429 (schema) + #421 (provider+catch-all+client) + **Commit A de #422** (`3ca53ae`): el adapter Better Auth (`createBetterAuthAccessAuthProvider`) + el nuevo test-support (`app/lib/auth/access-auth.test-support.ts`). Es **aditivo** — todavía no cablea el selector ni retira el test provider.

### Por qué hay handoff en vez de estar hecho

El cutover es **atómico**: al borrar el test-provider, todo typecheckea roto hasta rewirear ~30 archivos, así que no se puede commitear en verde por partes. No entra en la ventana de 25/30 min de un runner headless (timeouteó dos veces; ver runs 29868038636 y anterior). En una sesión interactiva sin guillotina se termina.

## Objetivo

Retirar el provider de test propio y correr **Better Auth real** contra PGlite in-process para toda la suite DB. **Una sola implementación de auth**, forward-only, sin flag (#266).

## Decisión de diseño confirmada (límite #422 vs #423)

`app/lib/auth/internal-user-auth.server.ts` tiene ramas `if (isTestAccessAuthMode())` (→ provider local) **y** ramas Supabase. **En #422: convertir solo las ramas de test a Better Auth real; dejar las ramas Supabase intactas** (su reemplazo por el admin plugin es **#423**). Confirmado con el usuario.

## Prerrequisitos

```bash
git checkout -B agent/prd-420-prd-build-fase-auth-supabase-auth-gotrue-better-au \
  origin/agent/prd-420-prd-build-fase-auth-supabase-auth-gotrue-better-au
pnpm install --frozen-lockfile
```

## Mapeo viejo → nuevo (drop-in del Commit A)

El nuevo `app/lib/auth/access-auth.test-support.ts` reemplaza a `access-test-auth.server.ts` con el mismo contrato de retorno (`{ headers, user, response }`):

| Viejo (`access-test-auth.server.ts`)                       | Nuevo (`access-auth.test-support.ts`)                                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `createLocalAccessUser`                                    | `createAccessUser`                                                                                                |
| `signInLocalAccessUser`                                    | `signInAccessUser`                                                                                                |
| `createLocalAccessRequestCookie` / leer `sb-access-token`  | `createAccessRequestCookie(headers)` (name-agnostic: arma el header `cookie` desde las Set-Cookie de Better Auth) |
| `readLocalAccessSession`                                   | `readAccessSession`                                                                                               |
| `ACCESS_SESSION_EXPIRES_IN_SECONDS` / `..._UPDATE_AGE_...` | idem (re-exportados)                                                                                              |
| (nuevos)                                                   | `findAccessSessionByUserId`, `markAccessUserEmailVerified`                                                        |

Para hashing/creación en prod: usar la API de Better Auth (`auth.api.*`) / `auth.$context`. La cookie de sesión de Better Auth es **`better-auth.session_token`** (default, sin `cookiePrefix` custom).

## Trabajo restante (atómico — hacer todo, después typecheck+test)

### 1. Selector de provider (prod)

`app/lib/auth/access-auth-provider.server.ts`: reemplazar el ternario `isTestAccessAuthMode() ? local : supabase` por **Better Auth siempre**:

```ts
export const accessAuthProvider = createBetterAuthAccessAuthProvider();
```

### 2. Quitar el flag + borrar el test provider

- Borrar `export function isTestAccessAuthMode()` de `app/lib/auth/access-auth-provider.shared.server.ts`.
- **Borrar** `app/lib/auth/access-auth-provider.local.server.ts` y `app/lib/auth/access-test-auth.server.ts`.

### 3. Detección de sesión stale en prod

`app/lib/auth/access-redirects.server.ts`: hoy detecta sesión vencida por prefijo `sb-` (`SUPABASE_COOKIE_NAME_PREFIX = "sb-"`). Debe reconocer la cookie de Better Auth (`better-auth.session_token`). Esto define la distinción `expirada` vs `continuar` en la redirección (hay test que lo cubre: `auth-session-policy.server.db.test.ts`).

### 4. `internal-user-auth.server.ts` (solo ramas de test → Better Auth real)

Reemplazar en las ramas `if (isTestAccessAuthMode())`: `createLocalAccessUser` / `upsertLocalAccessPassword` / `verifyLocalAccessPassword` por su equivalente Better Auth real (via `auth.api` / test-support). **No tocar** las ramas Supabase (#423). Como el flag desaparece, resolver que en entorno de test la creación/verificación de internos use Better Auth real.

### 5. `user-invitation.server.ts`

Reemplaza `createLocalAccessPasswordHash` (import de `access-test-auth.server.ts`) por el hashing scrypt de Better Auth (`auth.$context` → password hasher, o `auth.api`).

### 6. Rewirear los importers (~16 restantes) + tests que hardcodean la cookie (~11)

**Importers de `isTestAccessAuthMode`/`access-test-auth`** (excluí los 2 a borrar y el nuevo test-support):

```
app/features/portal/shell/server.db.test.ts
app/lib/academies/onboarding-maintenance.server.db.test.ts
app/lib/admin/academies/account-current-route.test-support.ts
app/lib/admin/test-support/db.ts
app/lib/admin/users/user-detail-route.server.db.test.ts
app/lib/admin/users/users-route.server.db.test.ts
app/lib/auth/access-recovery.server.db.test.ts
app/lib/auth/auth-session-policy.server.db.test.ts
app/lib/auth/internal-access.server.db.test.ts
app/lib/auth/internal-navigation.server.db.test.ts
app/lib/auth/logout-route.server.db.test.ts
app/lib/auth/mandatory-password-change-route.server.db.test.ts
app/lib/test-support/academies.ts
```

**Tests con helper inline que grepea `sb-access-token`** → usar `createAccessRequestCookie(headers)` (name-agnostic) o el nombre `better-auth.session_token`:

```
app/features/portal/test-support/db.ts
app/lib/academies/onboarding.server.db.test.ts
app/lib/auth/access-recovery.server.db.test.ts
app/lib/auth/access-ui.validation.test.ts
app/lib/auth/auth-session-policy.server.db.test.ts
app/lib/auth/internal-access.server.db.test.ts
app/lib/auth/internal-navigation.server.db.test.ts
app/lib/auth/logout-route.server.db.test.ts
app/lib/auth/mandatory-password-change-route.server.db.test.ts
app/lib/auth/registration-confirmation-route.server.test.ts
app/lib/auth/supabase-auth-ssr.server.test.ts
```

> `supabase-auth-ssr.server.ts/.test.ts` siguen siendo de Supabase (deps se conservan hasta el decommission #303) — revisá si esos usos de `sb-` son legítimos (SSR de Supabase) y **no** los toques por error.

## Decisiones de diseño ya resueltas en el Commit A (respetarlas)

Del run del agente especializado (log run `29868038636`, por si hace falta reconstruir detalle):

- **Recovery:** el token de reset de Better Auth se puentea al contrato `código→cookie→/cambiar-contrasena` via una **cookie firmada** (ya en el adapter).
- **Alta pública de academias:** la confirmación queda **app-owned / diferida** hasta el email-confirm (ADR-0001) — ya en el adapter (`startEmailSignUp` difiere la creación).
- **`debug*` tokens:** se leen de la tabla `verification` (`readLatestBetterAuthVerificationValue`) para los tests.
- **Selección de provider:** config/forward-only (Better Auth siempre); en test no hay `SUPABASE_URL`, pero con selección directa a Better Auth eso ya no importa.

## Validación

- **In-loop:** `pnpm typecheck` · `pnpm test:db` (PGlite) · `pnpm build` · `format:check`.
- **NO** correr `pnpm test:db:postgres` in-loop: es el **gate de CI del PR** (`ci.yml` job `db-gate`). Correrlo adentro hace timeoutear (fue la causa del primer fallo de #422).
- Iterá con `pnpm test:db <path>` sobre los archivos afectados; después la suite completa `pnpm test:db`.

## Al terminar (en verde)

1. Commit ("feat(auth): cutover de tests a Better Auth real, retirar test provider — Part of #420").
2. `git push` a la rama compartida.
3. Cerrar #422 (o dejar que el PR lo cierre si el body lo referencia).
4. Para seguir la cadena del PRD: sacar `agent:blocked` y poner `agent:implement` en **#420** → corre #423 (internos admin plugin).
5. **Borrar este `HANDOFF-422.md`.**

## Gotchas

- **Atómico:** no hay typecheck-green hasta rewirear todo. Trabajá hasta verde, después commiteás.
- El bank-on-failure del runner solo rescata **commits**; por eso esto no avanzaba headless (el trabajo no es commiteable hasta verde).
- No arrastrar `test:db:postgres` a los cuerpos de issues ni a la validación in-loop (lección de #422).
