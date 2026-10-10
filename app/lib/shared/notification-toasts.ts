import { type ToastMessage } from "@/lib/shared/toasts";

type NotificationToast = ToastMessage & {
  id: string;
};

export const notificationToastIds = {
  "event-form-error": "route-notification:event-form-error",
  "profile-saved": "route-notification:profile-saved",
  "professor-created": "route-notification:professor-created",
  "professor-saved": "route-notification:professor-saved",
  "professor-archived": "route-notification:professor-archived",
  "professor-reactivated": "route-notification:professor-reactivated",
  "dancer-created": "route-notification:dancer-created",
  "dancer-saved": "route-notification:dancer-saved",
  "dancer-saved-needs-verification":
    "route-notification:dancer-saved-needs-verification",
  "dancer-archived": "route-notification:dancer-archived",
  "dancer-reactivated": "route-notification:dancer-reactivated",
  "dancer-verified": "route-notification:dancer-verified",
  "dancers-merged": "route-notification:dancers-merged",
  "professors-merged": "route-notification:professors-merged",
  "choreography-created": "route-notification:choreography-created",
  "choreography-saved": "route-notification:choreography-saved",
  "choreography-deleted": "route-notification:choreography-deleted",
  "choreography-withdrawn": "route-notification:choreography-withdrawn",
  "choreography-restored": "route-notification:choreography-restored",
  "user-form-error": "route-notification:user-form-error",
  "event-activated": "route-notification:event-activated",
  "event-deactivated": "route-notification:event-deactivated",
  "event-saved": "route-notification:event-saved",
  "event-deleted": "route-notification:event-deleted",
  "schedule-saved": "route-notification:schedule-saved",
  "schedule-deleted": "route-notification:schedule-deleted",
  "registration-opened": "route-notification:registration-opened",
  "registration-closed": "route-notification:registration-closed",
  "seminar-created": "route-notification:seminar-created",
  "seminar-saved": "route-notification:seminar-saved",
  "seminar-deleted": "route-notification:seminar-deleted",
  "schedule-capacity-saved": "route-notification:schedule-capacity-saved",
  "schedule-capacity-deleted": "route-notification:schedule-capacity-deleted",
  "price-saved": "route-notification:price-saved",
  "price-deleted": "route-notification:price-deleted",
  "payment-recorded": "route-notification:payment-recorded",
  "payment-saved": "route-notification:payment-saved",
  "comprobante-recovered": "route-notification:comprobante-recovered",
  "results-hidden": "route-notification:results-hidden",
  "category-saved": "route-notification:category-saved",
  "category-deleted": "route-notification:category-deleted",
  "modality-saved": "route-notification:modality-saved",
  "modality-deleted": "route-notification:modality-deleted",
  "criteria-saved": "route-notification:criteria-saved",
  "academy-deleted": "route-notification:academy-deleted",
  "academies-merged": "route-notification:academies-merged",
  "internal-user-created": "route-notification:internal-user-created",
  "internal-user-updated": "route-notification:internal-user-updated",
  "internal-user-reset": "route-notification:internal-user-reset",
  "internal-user-suspended": "route-notification:internal-user-suspended",
  "internal-user-reactivated": "route-notification:internal-user-reactivated",
  "voter-sign-in-failed": "route-notification:voter-sign-in-failed",
  "grand-final-academy-left-modality":
    "route-notification:grand-final-academy-left-modality",
} as const;

type NotificationToastKey = Exclude<
  keyof typeof notificationToastIds,
  "event-form-error" | "user-form-error"
>;

export const notificationToasts = {
  "profile-saved": {
    id: notificationToastIds["profile-saved"],
    message: "Perfil guardado.",
    variant: "success",
  },
  "professor-created": {
    id: notificationToastIds["professor-created"],
    message: "Profesor creado.",
    variant: "success",
  },
  "professor-saved": {
    id: notificationToastIds["professor-saved"],
    message: "Profesor guardado.",
    variant: "success",
  },
  "professor-archived": {
    id: notificationToastIds["professor-archived"],
    message: "Profesor archivado.",
    variant: "success",
  },
  "professor-reactivated": {
    id: notificationToastIds["professor-reactivated"],
    message: "Profesor reactivado.",
    variant: "success",
  },
  "dancer-created": {
    id: notificationToastIds["dancer-created"],
    message: "Bailarín creado.",
    variant: "success",
  },
  "dancer-saved": {
    id: notificationToastIds["dancer-saved"],
    message: "Bailarín guardado.",
    variant: "success",
  },
  "dancer-saved-needs-verification": {
    id: notificationToastIds["dancer-saved-needs-verification"],
    message: "Bailarín guardado. La identidad volvió a no verificado.",
    variant: "success",
  },
  "dancers-merged": {
    id: notificationToastIds["dancers-merged"],
    message: "Bailarines fusionados.",
    variant: "success",
  },
  "professors-merged": {
    id: notificationToastIds["professors-merged"],
    message: "Profesores fusionados.",
    variant: "success",
  },
  "dancer-archived": {
    id: notificationToastIds["dancer-archived"],
    message: "Bailarín archivado.",
    variant: "success",
  },
  "dancer-reactivated": {
    id: notificationToastIds["dancer-reactivated"],
    message: "Bailarín reactivado.",
    variant: "success",
  },
  "dancer-verified": {
    id: notificationToastIds["dancer-verified"],
    message: "Bailarín verificado.",
    variant: "success",
  },
  "choreography-created": {
    id: notificationToastIds["choreography-created"],
    message: "Coreografía creada.",
    variant: "success",
  },
  "choreography-saved": {
    id: notificationToastIds["choreography-saved"],
    message: "Coreografía guardada.",
    variant: "success",
  },
  "choreography-deleted": {
    id: notificationToastIds["choreography-deleted"],
    message: "Coreografía eliminada.",
    variant: "success",
  },
  "choreography-withdrawn": {
    id: notificationToastIds["choreography-withdrawn"],
    message: "Coreografía retirada. Su dinero sigue asignado.",
    variant: "success",
  },
  "choreography-restored": {
    id: notificationToastIds["choreography-restored"],
    message: "Coreografía restaurada.",
    variant: "success",
  },
  "event-activated": {
    id: notificationToastIds["event-activated"],
    message: "Evento activado.",
    variant: "success",
  },
  "event-deactivated": {
    id: notificationToastIds["event-deactivated"],
    message: "Evento desactivado.",
    variant: "success",
  },
  "event-saved": {
    id: notificationToastIds["event-saved"],
    message: "Evento guardado.",
    variant: "success",
  },
  "event-deleted": {
    id: notificationToastIds["event-deleted"],
    message: "Evento eliminado.",
    variant: "success",
  },
  "schedule-saved": {
    id: notificationToastIds["schedule-saved"],
    message: "Cronograma guardado.",
    variant: "success",
  },
  "schedule-deleted": {
    id: notificationToastIds["schedule-deleted"],
    message: "Cronograma eliminado.",
    variant: "success",
  },
  "registration-opened": {
    id: notificationToastIds["registration-opened"],
    message: "Inscripciones abiertas.",
    variant: "success",
  },
  "registration-closed": {
    id: notificationToastIds["registration-closed"],
    message: "Inscripciones cerradas.",
    variant: "success",
  },
  "seminar-created": {
    id: notificationToastIds["seminar-created"],
    message: "Seminario creado.",
    variant: "success",
  },
  "seminar-saved": {
    id: notificationToastIds["seminar-saved"],
    message: "Seminario guardado.",
    variant: "success",
  },
  "seminar-deleted": {
    id: notificationToastIds["seminar-deleted"],
    message: "Seminario eliminado.",
    variant: "success",
  },
  "schedule-capacity-saved": {
    id: notificationToastIds["schedule-capacity-saved"],
    message: "Cupo de cronograma guardado.",
    variant: "success",
  },
  "schedule-capacity-deleted": {
    id: notificationToastIds["schedule-capacity-deleted"],
    message: "Cupo de cronograma eliminado.",
    variant: "success",
  },
  "price-saved": {
    id: notificationToastIds["price-saved"],
    message: "Precio guardado.",
    variant: "success",
  },
  "price-deleted": {
    id: notificationToastIds["price-deleted"],
    message: "Precio eliminado.",
    variant: "success",
  },
  "payment-recorded": {
    id: notificationToastIds["payment-recorded"],
    message: "Pago registrado.",
    variant: "success",
  },
  "payment-saved": {
    id: notificationToastIds["payment-saved"],
    message: "Pago guardado.",
    variant: "success",
  },
  "comprobante-recovered": {
    id: notificationToastIds["comprobante-recovered"],
    // The emission was seen failing for up to 45 seconds and then finished fine:
    // switching to "done" without saying anything reads as a glitch (ADR-0012). It
    // carries no pending action — the comprobante ended up authorized and on
    // record — so a toast is enough.
    message:
      "El comprobante ya estaba autorizado en ARCA. Lo recuperamos y quedó registrado.",
    variant: "success",
  },
  "results-hidden": {
    id: notificationToastIds["results-hidden"],
    message: "Se ocultaron los resultados.",
    variant: "success",
  },
  "category-saved": {
    id: notificationToastIds["category-saved"],
    message: "Categoría guardada.",
    variant: "success",
  },
  "category-deleted": {
    id: notificationToastIds["category-deleted"],
    message: "Categoría eliminada.",
    variant: "success",
  },
  "modality-saved": {
    id: notificationToastIds["modality-saved"],
    message: "Modalidad guardada.",
    variant: "success",
  },
  "criteria-saved": {
    id: notificationToastIds["criteria-saved"],
    message: "Criterios guardados.",
    variant: "success",
  },
  "modality-deleted": {
    id: notificationToastIds["modality-deleted"],
    message: "Modalidad eliminada.",
    variant: "success",
  },
  "academy-deleted": {
    id: notificationToastIds["academy-deleted"],
    message: "Academia eliminada.",
    variant: "success",
  },
  "academies-merged": {
    id: notificationToastIds["academies-merged"],
    message: "Academias fusionadas.",
    variant: "success",
  },
  "internal-user-created": {
    id: notificationToastIds["internal-user-created"],
    message: "Usuario interno creado.",
    variant: "success",
  },
  "internal-user-updated": {
    id: notificationToastIds["internal-user-updated"],
    message: "Usuario interno actualizado.",
    variant: "success",
  },
  "internal-user-reset": {
    id: notificationToastIds["internal-user-reset"],
    message: "Contraseña restablecida.",
    variant: "success",
  },
  "internal-user-suspended": {
    id: notificationToastIds["internal-user-suspended"],
    message: "Usuario suspendido.",
    variant: "success",
  },
  "internal-user-reactivated": {
    id: notificationToastIds["internal-user-reactivated"],
    message: "Usuario reactivado.",
    variant: "success",
  },
  "voter-sign-in-failed": {
    id: notificationToastIds["voter-sign-in-failed"],
    message: "No se pudo ingresar con Google. Probá de nuevo.",
    variant: "error",
  },
  "grand-final-academy-left-modality": {
    id: notificationToastIds["grand-final-academy-left-modality"],
    message:
      "Guardaste los cambios. La academia ya no cumple los requisitos en esa modalidad y ningún juez la elige, así que salió de la lista.",
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
