# Feedback y redirección de formularios

Convención única para el feedback (toasts de éxito/error) y la redirección de los
`action` de formularios en En Escena. Responde a #201 ("¿hace falta el query param
en la URL para mostrar un toast?") y es la referencia durable del PRD #409.

Regla base para cualquier formulario nuevo: **decidí primero si la vista actual
sigue teniendo sentido después del submit**. Eso determina si te quedás o redirigís,
y por qué medio viaja el mensaje. No re-derives la decisión formulario por formulario:
buscá el caso en la matriz de abajo.

## Por qué "quedarse" es el default

En React Router, un `action` que **retorna sin `redirect`** revalida automáticamente
los `loader` de las rutas activas. "Reconstruir lo que cambió" (la lista con el nuevo
registro, el detalle con los datos guardados) es gratis: no hace falta navegar a
ningún lado para que la UI refleje la mutación.

Por eso, redirigir "solo para mostrar un toast" es un antipatrón. Antes de este PRD,
la mayoría de los creates/edits redirigían a la misma vista con
`?notificacion=<clave>` en la URL únicamente para transportar el mensaje. Eso generaba
navegaciones innecesarias, ensuciaba la URL momentáneamente y obligaba a un
`useEffect` global (`RouteToasts` en `root.tsx`) que parseaba y limpiaba el param.

Se redirige **solo cuando la vista actual deja de existir o de tener sentido**, no para
mostrar feedback.

## Matriz de comportamiento

| Caso                                             | ¿Redirige?                                                         | Transporte del toast                      |
| ------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------- |
| Crear/editar por diálogo (sobre una lista)       | No                                                                 | Directo desde `actionData`/`fetcher.data` |
| Editar en formulario dedicado (vista de detalle) | No                                                                 | Directo desde `actionData`                |
| Borrar inline desde una lista                    | No                                                                 | Directo desde `fetcher.data`              |
| Borrar desde una vista de detalle                | Sí → a la lista                                                    | Flash session                             |
| Crear en una ruta dedicada                       | Sí → al detalle del nuevo recurso (o a la lista si no hay detalle) | Flash session                             |

Notas sobre la matriz:

- **Los tres primeros casos "se quedan":** retornan `{ status: "success", message }`
  (o `{ status: "error", message, fieldErrors, values }` ante un fallo de validación),
  el `loader` revalida y la UI se reconstruye en el lugar. El error de validación deja
  a la usuaria donde estaba, conservando lo que cargó.
- **Los dos últimos "redirigen"** porque después del submit la vista de origen ya no
  tiene sentido: el recurso borrado desde su detalle ya no existe, y una ruta de
  creación dedicada no es un lugar donde quedarse (no hay flujos de carga masiva, así
  que crear-usuario-interno **no** vuelve al formulario vacío: va al detalle del nuevo).
- **No hay excepción "quedarse-y-resetear".** Todo create dedicado se alinea al mismo
  destino (detalle del nuevo, o su lista).

## Dos transportes: flash session vs. `actionData` directo

El **catálogo de mensajes** (claves estables, variantes success/error/info/warning,
IDs anti-duplicado) se conserva centralizado y su fuente se comparte entre los dos
flujos. Lo que cambia es cómo llega el mensaje al cliente.

### Directo desde `actionData` (los casos que se quedan)

El `action` retorna `{ status, message }`; la ruta pasa ese objeto por
`useServerActionToast` (`app/lib/shared/toasts.ts`), que dispara el toast con
`showToastMessage`. Ver prior art en `features/portal/profile/action.test.ts`
(rama que retorna `data({ status: "success", ... })`). El `id` estable del toast se
pasa a Sonner para que un re-render no apile duplicados.

Este es el patrón para create/edit por diálogo, edit en detalle y delete inline. No
toca la URL ni la sesión.

### Flash session (los casos que redirigen)

Cuando el `action` **sí** redirige, el mensaje no puede viajar en `actionData` (la
respuesta es un `redirect`, no un objeto de datos). Viaja por una **flash session**:
una cookie de un solo uso que el `action` adjunta a la respuesta de `redirect`, y que
el `loader`/root de la ruta destino **lee-y-limpia** (one-time) para disparar el toast.
Al consumirse en la primera lectura, el toast aparece una sola vez y no reaparece al
recargar o navegar hacia atrás.

Es el patrón idiomático de React Router. El proyecto ya tiene sesión (Supabase Auth /
cookies, ver `app/lib/auth/supabase-auth-ssr.server.ts`), así que el helper de flash
session reutiliza esa infraestructura en lugar de introducir sesión nueva. El helper
es un módulo único en `app/lib/shared` (ver #411); no reinventes el mecanismo por
feature.

**Respuesta a #201:** el query param **no** hace falta para editar-en-el-lugar (la
mayoría de los casos); para los redirects reales el transporte correcto es la flash
session, **no** un param en la URL. La URL nunca debe mostrar un parámetro técnico de
notificación.

### Legacy en transición: `?notificacion=`

El query param `?notificacion=<clave>` y su lector `RouteToasts` en `root.tsx`
(catálogo `app/lib/shared/route-notification-toasts.ts`) son **legacy**. Se mantienen
funcionando durante la migración expand–contract y se **eliminan** en el ticket de
contract (#416), una vez que ningún `action` los use. No agregues formularios nuevos
sobre este mecanismo: usá flash session (redirect) o `actionData` directo (se queda).

## Fuera de la matriz: flujos de auth

Los flujos de autenticación **no** siguen esta matriz y **no** migran a flash session:

- Los redirects de auth cruzan una frontera donde se **limpian las cookies** de sesión
  (logout y expiración destruyen la sesión), así que un flash de sesión no sobreviviría.
- Algunos params acarrean **estado de ruteo real**, no solo el mensaje
  (`redirectTo`, `recuperacion` como modo de loader).

Por eso auth usa **query params propios** traducidos a toast en `ingresar.tsx`
(`getLoginNotice` / `useLoginNoticeToast`, catálogo en
`app/lib/auth/access-form.shared.ts`):

- `motivo=expirada|continuar` — sesión expirada o "ingresá para continuar" (producidos
  por `access-redirects.server.ts`, que además limpia las cookies `sb-`).
- `sesion=cerrada` — logout (`salir.tsx`).
- `recuperacion=ok` — cambio de contraseña completado (`cambiar-contrasena.tsx`).

Ahí el query param es la herramienta correcta. Los errores de "enlace inválido"
(invitación/recovery con token inválido, error de confirmación de email) se muestran
como página estática inline, sin toast, y también quedan fuera de la matriz de submit.

## Qué testear

El seam observable es la **decisión del `action`**, no que Sonner pinte el toast:

- Casos que se quedan → el `action` retorna `{ status, message }` **sin** `redirect`.
- Casos que redirigen → el `action` lanza un `redirect` que transporta el mensaje flash.

Testeá eso en los `*.server.db.test.ts` / `action.test.ts` del handler (prior art:
`features/portal/profile/`, `features/portal/dancers/detail/`,
`features/portal/professors/list/`). El helper de flash session se testea en aislamiento:
setear un mensaje produce un `redirect` que lo transporta; leerlo lo consume una sola
vez (la segunda lectura no devuelve nada).
