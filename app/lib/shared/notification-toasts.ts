import { type ToastMessage } from "@/lib/shared/toasts";

type NotificationToast = ToastMessage & {
  id: string;
};

export const notificationToastIds = {
  "event-form-error": "route-notification:event-form-error",
  "perfil-guardado": "route-notification:perfil-guardado",
  "profesor-creado": "route-notification:profesor-creado",
  "profesor-guardado": "route-notification:profesor-guardado",
  "profesor-archivado": "route-notification:profesor-archivado",
  "profesor-reactivado": "route-notification:profesor-reactivado",
  "bailarin-creado": "route-notification:bailarin-creado",
  "bailarin-guardado": "route-notification:bailarin-guardado",
  "bailarin-guardado-requiere-verificacion":
    "route-notification:bailarin-guardado-requiere-verificacion",
  "bailarin-archivado": "route-notification:bailarin-archivado",
  "bailarin-reactivado": "route-notification:bailarin-reactivado",
  "bailarin-verificado": "route-notification:bailarin-verificado",
  "coreografia-creada": "route-notification:coreografia-creada",
  "coreografia-guardada": "route-notification:coreografia-guardada",
  "coreografia-eliminada": "route-notification:coreografia-eliminada",
  "user-form-error": "route-notification:user-form-error",
  "evento-activado": "route-notification:evento-activado",
  "evento-desactivado": "route-notification:evento-desactivado",
  "evento-guardado": "route-notification:evento-guardado",
  "evento-eliminado": "route-notification:evento-eliminado",
  "cronograma-guardado": "route-notification:cronograma-guardado",
  "cronograma-eliminado": "route-notification:cronograma-eliminado",
  "cupo-cronograma-guardado": "route-notification:cupo-cronograma-guardado",
  "cupo-cronograma-eliminado": "route-notification:cupo-cronograma-eliminado",
  "precio-guardado": "route-notification:precio-guardado",
  "precio-eliminado": "route-notification:precio-eliminado",
  "pago-registrado": "route-notification:pago-registrado",
  "pago-guardado": "route-notification:pago-guardado",
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

type NotificationToastKey = Exclude<
  keyof typeof notificationToastIds,
  "event-form-error" | "user-form-error"
>;

export const notificationToasts = {
  "perfil-guardado": {
    id: notificationToastIds["perfil-guardado"],
    message: "Perfil guardado.",
    variant: "success",
  },
  "profesor-creado": {
    id: notificationToastIds["profesor-creado"],
    message: "Profesor creado.",
    variant: "success",
  },
  "profesor-guardado": {
    id: notificationToastIds["profesor-guardado"],
    message: "Profesor guardado.",
    variant: "success",
  },
  "profesor-archivado": {
    id: notificationToastIds["profesor-archivado"],
    message: "Profesor archivado.",
    variant: "success",
  },
  "profesor-reactivado": {
    id: notificationToastIds["profesor-reactivado"],
    message: "Profesor reactivado.",
    variant: "success",
  },
  "bailarin-creado": {
    id: notificationToastIds["bailarin-creado"],
    message: "Bailarín creado.",
    variant: "success",
  },
  "bailarin-guardado": {
    id: notificationToastIds["bailarin-guardado"],
    message: "Bailarín guardado.",
    variant: "success",
  },
  "bailarin-guardado-requiere-verificacion": {
    id: notificationToastIds["bailarin-guardado-requiere-verificacion"],
    message: "Bailarín guardado. La identidad volvió a no verificado.",
    variant: "success",
  },
  "bailarin-archivado": {
    id: notificationToastIds["bailarin-archivado"],
    message: "Bailarín archivado.",
    variant: "success",
  },
  "bailarin-reactivado": {
    id: notificationToastIds["bailarin-reactivado"],
    message: "Bailarín reactivado.",
    variant: "success",
  },
  "bailarin-verificado": {
    id: notificationToastIds["bailarin-verificado"],
    message: "Bailarín verificado.",
    variant: "success",
  },
  "coreografia-creada": {
    id: notificationToastIds["coreografia-creada"],
    message: "Coreografía creada.",
    variant: "success",
  },
  "coreografia-guardada": {
    id: notificationToastIds["coreografia-guardada"],
    message: "Coreografía guardada.",
    variant: "success",
  },
  "coreografia-eliminada": {
    id: notificationToastIds["coreografia-eliminada"],
    message: "Coreografía eliminada.",
    variant: "success",
  },
  "evento-activado": {
    id: notificationToastIds["evento-activado"],
    message: "Evento activado.",
    variant: "success",
  },
  "evento-desactivado": {
    id: notificationToastIds["evento-desactivado"],
    message: "Evento desactivado.",
    variant: "success",
  },
  "evento-guardado": {
    id: notificationToastIds["evento-guardado"],
    message: "Evento guardado.",
    variant: "success",
  },
  "evento-eliminado": {
    id: notificationToastIds["evento-eliminado"],
    message: "Evento eliminado.",
    variant: "success",
  },
  "cronograma-guardado": {
    id: notificationToastIds["cronograma-guardado"],
    message: "Cronograma guardado.",
    variant: "success",
  },
  "cronograma-eliminado": {
    id: notificationToastIds["cronograma-eliminado"],
    message: "Cronograma eliminado.",
    variant: "success",
  },
  "cupo-cronograma-guardado": {
    id: notificationToastIds["cupo-cronograma-guardado"],
    message: "Cupo de cronograma guardado.",
    variant: "success",
  },
  "cupo-cronograma-eliminado": {
    id: notificationToastIds["cupo-cronograma-eliminado"],
    message: "Cupo de cronograma eliminado.",
    variant: "success",
  },
  "precio-guardado": {
    id: notificationToastIds["precio-guardado"],
    message: "Precio guardado.",
    variant: "success",
  },
  "precio-eliminado": {
    id: notificationToastIds["precio-eliminado"],
    message: "Precio eliminado.",
    variant: "success",
  },
  "pago-registrado": {
    id: notificationToastIds["pago-registrado"],
    message: "Pago registrado.",
    variant: "success",
  },
  "pago-guardado": {
    id: notificationToastIds["pago-guardado"],
    message: "Pago guardado.",
    variant: "success",
  },
  "programa-visible": {
    id: notificationToastIds["programa-visible"],
    message: "Programa visible.",
    variant: "success",
  },
  "programa-oculto": {
    id: notificationToastIds["programa-oculto"],
    message: "Programa oculto.",
    variant: "success",
  },
  "resultados-visibles": {
    id: notificationToastIds["resultados-visibles"],
    message: "Resultados visibles.",
    variant: "success",
  },
  "resultados-ocultos": {
    id: notificationToastIds["resultados-ocultos"],
    message: "Resultados ocultos.",
    variant: "success",
  },
  "categoria-guardada": {
    id: notificationToastIds["categoria-guardada"],
    message: "Categoría guardada.",
    variant: "success",
  },
  "categoria-eliminada": {
    id: notificationToastIds["categoria-eliminada"],
    message: "Categoría eliminada.",
    variant: "success",
  },
  "modalidad-guardada": {
    id: notificationToastIds["modalidad-guardada"],
    message: "Modalidad guardada.",
    variant: "success",
  },
  "modalidad-eliminada": {
    id: notificationToastIds["modalidad-eliminada"],
    message: "Modalidad eliminada.",
    variant: "success",
  },
  "usuario-interno-creado": {
    id: notificationToastIds["usuario-interno-creado"],
    message: "Usuario interno creado.",
    variant: "success",
  },
  "usuario-interno-actualizado": {
    id: notificationToastIds["usuario-interno-actualizado"],
    message: "Usuario interno actualizado.",
    variant: "success",
  },
  "usuario-interno-restablecido": {
    id: notificationToastIds["usuario-interno-restablecido"],
    message: "Contraseña temporal guardada.",
    variant: "success",
  },
  "usuario-interno-suspendido": {
    id: notificationToastIds["usuario-interno-suspendido"],
    message: "Usuario suspendido.",
    variant: "success",
  },
  "usuario-interno-reactivado": {
    id: notificationToastIds["usuario-interno-reactivado"],
    message: "Usuario reactivado.",
    variant: "success",
  },
} as const satisfies Record<NotificationToastKey, NotificationToast>;

export type NotificationKey = keyof typeof notificationToasts;

export function getNotificationToast(
  notification: string,
): NotificationToast | undefined {
  if (!isNotificationKey(notification)) {
    return undefined;
  }

  return notificationToasts[notification];
}

function isNotificationKey(
  notification: string,
): notification is NotificationKey {
  return Object.prototype.hasOwnProperty.call(notificationToasts, notification);
}
