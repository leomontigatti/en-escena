import { showToastMessage, type ToastMessage } from "@/lib/shared/toasts";

type RouteNotificationToast = ToastMessage & {
  id: string;
};

export const routeNotificationToastIds = {
  "event-form-error": "route-notification:event-form-error",
  "user-form-error": "route-notification:user-form-error",
  "evento-activado": "route-notification:evento-activado",
  "evento-desactivado": "route-notification:evento-desactivado",
  "evento-guardado": "route-notification:evento-guardado",
  "evento-eliminado": "route-notification:evento-eliminado",
  "programa-visible": "route-notification:programa-visible",
  "programa-oculto": "route-notification:programa-oculto",
  "resultados-visibles": "route-notification:resultados-visibles",
  "resultados-ocultos": "route-notification:resultados-ocultos",
  "categoria-guardada": "route-notification:categoria-guardada",
  "categoria-eliminada": "route-notification:categoria-eliminada",
  "modalidad-guardada": "route-notification:modalidad-guardada",
  "modalidad-eliminada": "route-notification:modalidad-eliminada",
  "usuario-interno-creado": "route-notification:usuario-interno-creado",
  "usuario-interno-actualizado":
    "route-notification:usuario-interno-actualizado",
  "usuario-interno-restablecido":
    "route-notification:usuario-interno-restablecido",
  "usuario-interno-suspendido": "route-notification:usuario-interno-suspendido",
  "usuario-interno-reactivado": "route-notification:usuario-interno-reactivado",
} as const;

type RouteNotificationToastKey = Exclude<
  keyof typeof routeNotificationToastIds,
  "event-form-error" | "user-form-error"
>;

export const routeNotificationToasts = {
  "evento-activado": {
    id: routeNotificationToastIds["evento-activado"],
    message: "Evento activado.",
    variant: "success",
  },
  "evento-desactivado": {
    id: routeNotificationToastIds["evento-desactivado"],
    message: "Evento desactivado.",
    variant: "success",
  },
  "evento-guardado": {
    id: routeNotificationToastIds["evento-guardado"],
    message: "Evento guardado.",
    variant: "success",
  },
  "evento-eliminado": {
    id: routeNotificationToastIds["evento-eliminado"],
    message: "Evento eliminado.",
    variant: "success",
  },
  "programa-visible": {
    id: routeNotificationToastIds["programa-visible"],
    message: "Programa visible.",
    variant: "success",
  },
  "programa-oculto": {
    id: routeNotificationToastIds["programa-oculto"],
    message: "Programa oculto.",
    variant: "success",
  },
  "resultados-visibles": {
    id: routeNotificationToastIds["resultados-visibles"],
    message: "Resultados visibles.",
    variant: "success",
  },
  "resultados-ocultos": {
    id: routeNotificationToastIds["resultados-ocultos"],
    message: "Resultados ocultos.",
    variant: "success",
  },
  "categoria-guardada": {
    id: routeNotificationToastIds["categoria-guardada"],
    message: "Categoría guardada.",
    variant: "success",
  },
  "categoria-eliminada": {
    id: routeNotificationToastIds["categoria-eliminada"],
    message: "Categoría eliminada.",
    variant: "success",
  },
  "modalidad-guardada": {
    id: routeNotificationToastIds["modalidad-guardada"],
    message: "Modalidad guardada.",
    variant: "success",
  },
  "modalidad-eliminada": {
    id: routeNotificationToastIds["modalidad-eliminada"],
    message: "Modalidad eliminada.",
    variant: "success",
  },
  "usuario-interno-creado": {
    id: routeNotificationToastIds["usuario-interno-creado"],
    message: "Usuario interno creado.",
    variant: "success",
  },
  "usuario-interno-actualizado": {
    id: routeNotificationToastIds["usuario-interno-actualizado"],
    message: "Usuario interno actualizado.",
    variant: "success",
  },
  "usuario-interno-restablecido": {
    id: routeNotificationToastIds["usuario-interno-restablecido"],
    message: "Contraseña temporal guardada.",
    variant: "success",
  },
  "usuario-interno-suspendido": {
    id: routeNotificationToastIds["usuario-interno-suspendido"],
    message: "Usuario suspendido.",
    variant: "success",
  },
  "usuario-interno-reactivado": {
    id: routeNotificationToastIds["usuario-interno-reactivado"],
    message: "Usuario reactivado.",
    variant: "success",
  },
} as const satisfies Record<RouteNotificationToastKey, RouteNotificationToast>;

export type RouteNotificationKey = keyof typeof routeNotificationToasts;

export function getRouteNotificationToast(
  notification: string,
): RouteNotificationToast | undefined {
  if (!isRouteNotificationKey(notification)) {
    return undefined;
  }

  return routeNotificationToasts[notification];
}

export function showRouteNotificationToast(notification: string) {
  const toastMessage = getRouteNotificationToast(notification);

  if (!toastMessage) {
    return false;
  }

  showToastMessage(toastMessage);

  return true;
}

function isRouteNotificationKey(
  notification: string,
): notification is RouteNotificationKey {
  return Object.prototype.hasOwnProperty.call(
    routeNotificationToasts,
    notification,
  );
}
