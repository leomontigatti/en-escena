import { showToastMessage, type ToastMessage } from "@/lib/shared/toasts";

type RouteNotificationToast = ToastMessage & {
  id: string;
};

export const routeNotificationToastIds = {
  "event-form-error": "route-notification:event-form-error",
  "profesor-creado": "route-notification:profesor-creado",
  "profesor-guardado": "route-notification:profesor-guardado",
  "profesor-archivado": "route-notification:profesor-archivado",
  "profesor-reactivado": "route-notification:profesor-reactivado",
  "bailarin-guardado": "route-notification:bailarin-guardado",
  "bailarin-archivado": "route-notification:bailarin-archivado",
  "bailarin-reactivado": "route-notification:bailarin-reactivado",
  "user-form-error": "route-notification:user-form-error",
  "evento-activado": "route-notification:evento-activado",
  "evento-desactivado": "route-notification:evento-desactivado",
  "evento-guardado": "route-notification:evento-guardado",
  "evento-eliminado": "route-notification:evento-eliminado",
  "bloque-horario-guardado": "route-notification:bloque-horario-guardado",
  "bloque-horario-eliminado": "route-notification:bloque-horario-eliminado",
  "cronograma-guardado": "route-notification:cronograma-guardado",
  "cronograma-eliminado": "route-notification:cronograma-eliminado",
  "precio-guardado": "route-notification:precio-guardado",
  "precio-eliminado": "route-notification:precio-eliminado",
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
  "profesor-creado": {
    id: routeNotificationToastIds["profesor-creado"],
    message: "Profesor creado.",
    variant: "success",
  },
  "profesor-guardado": {
    id: routeNotificationToastIds["profesor-guardado"],
    message: "Profesor guardado.",
    variant: "success",
  },
  "profesor-archivado": {
    id: routeNotificationToastIds["profesor-archivado"],
    message: "Profesor archivado.",
    variant: "success",
  },
  "profesor-reactivado": {
    id: routeNotificationToastIds["profesor-reactivado"],
    message: "Profesor reactivado.",
    variant: "success",
  },
  "bailarin-guardado": {
    id: routeNotificationToastIds["bailarin-guardado"],
    message: "Bailarín guardado.",
    variant: "success",
  },
  "bailarin-archivado": {
    id: routeNotificationToastIds["bailarin-archivado"],
    message: "Bailarín archivado.",
    variant: "success",
  },
  "bailarin-reactivado": {
    id: routeNotificationToastIds["bailarin-reactivado"],
    message: "Bailarín reactivado.",
    variant: "success",
  },
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
  "bloque-horario-guardado": {
    id: routeNotificationToastIds["bloque-horario-guardado"],
    message: "Bloque horario guardado.",
    variant: "success",
  },
  "bloque-horario-eliminado": {
    id: routeNotificationToastIds["bloque-horario-eliminado"],
    message: "Bloque horario eliminado.",
    variant: "success",
  },
  "cronograma-guardado": {
    id: routeNotificationToastIds["cronograma-guardado"],
    message: "Cronograma guardado.",
    variant: "success",
  },
  "cronograma-eliminado": {
    id: routeNotificationToastIds["cronograma-eliminado"],
    message: "Cronograma eliminado.",
    variant: "success",
  },
  "precio-guardado": {
    id: routeNotificationToastIds["precio-guardado"],
    message: "Precio guardado.",
    variant: "success",
  },
  "precio-eliminado": {
    id: routeNotificationToastIds["precio-eliminado"],
    message: "Precio eliminado.",
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
