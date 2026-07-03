import { beforeEach, describe, expect, test, vi } from "vitest";

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    success: toastSuccess,
  },
}));

import {
  getRouteNotificationToast,
  routeNotificationToasts,
  showRouteNotificationToast,
} from "@/lib/shared/route-notification-toasts";

describe("route notification toasts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("defines shared toast ids, messages, and variants", () => {
    expect(routeNotificationToasts["profesor-guardado"]).toEqual({
      id: "route-notification:profesor-guardado",
      message: "Profesor guardado.",
      variant: "success",
    });
    expect(routeNotificationToasts["profesor-archivado"]).toEqual({
      id: "route-notification:profesor-archivado",
      message: "Profesor archivado.",
      variant: "success",
    });
    expect(routeNotificationToasts["profesor-reactivado"]).toEqual({
      id: "route-notification:profesor-reactivado",
      message: "Profesor reactivado.",
      variant: "success",
    });
    expect(routeNotificationToasts["perfil-guardado"]).toEqual({
      id: "route-notification:perfil-guardado",
      message: "Perfil guardado.",
      variant: "success",
    });
    expect(routeNotificationToasts["bailarin-archivado"]).toEqual({
      id: "route-notification:bailarin-archivado",
      message: "Bailarín archivado.",
      variant: "success",
    });
    expect(routeNotificationToasts["bailarin-creado"]).toEqual({
      id: "route-notification:bailarin-creado",
      message: "Bailarín creado.",
      variant: "success",
    });
    expect(routeNotificationToasts["bailarin-guardado"]).toEqual({
      id: "route-notification:bailarin-guardado",
      message: "Bailarín guardado.",
      variant: "success",
    });
    expect(
      routeNotificationToasts["bailarin-guardado-requiere-verificacion"],
    ).toEqual({
      id: "route-notification:bailarin-guardado-requiere-verificacion",
      message: "Bailarín guardado. La identidad volvió a no verificado.",
      variant: "success",
    });
    expect(routeNotificationToasts["bailarin-reactivado"]).toEqual({
      id: "route-notification:bailarin-reactivado",
      message: "Bailarín reactivado.",
      variant: "success",
    });
    expect(routeNotificationToasts["bailarin-verificado"]).toEqual({
      id: "route-notification:bailarin-verificado",
      message: "Bailarín verificado.",
      variant: "success",
    });
    expect(routeNotificationToasts["coreografia-creada"]).toEqual({
      id: "route-notification:coreografia-creada",
      message: "Coreografía creada.",
      variant: "success",
    });
    expect(routeNotificationToasts["coreografia-guardada"]).toEqual({
      id: "route-notification:coreografia-guardada",
      message: "Coreografía guardada.",
      variant: "success",
    });
    expect(routeNotificationToasts["coreografia-eliminada"]).toEqual({
      id: "route-notification:coreografia-eliminada",
      message: "Coreografía eliminada.",
      variant: "success",
    });
    expect(routeNotificationToasts["evento-guardado"]).toEqual({
      id: "route-notification:evento-guardado",
      message: "Evento guardado.",
      variant: "success",
    });
    expect(routeNotificationToasts["precio-guardado"]).toEqual({
      id: "route-notification:precio-guardado",
      message: "Precio guardado.",
      variant: "success",
    });
    expect(routeNotificationToasts["cronograma-eliminado"]).toEqual({
      id: "route-notification:cronograma-eliminado",
      message: "Cronograma eliminado.",
      variant: "success",
    });
    expect(routeNotificationToasts["cupo-cronograma-guardado"]).toEqual({
      id: "route-notification:cupo-cronograma-guardado",
      message: "Cupo de cronograma guardado.",
      variant: "success",
    });
    expect(routeNotificationToasts["usuario-interno-creado"]).toEqual({
      id: "route-notification:usuario-interno-creado",
      message: "Usuario interno creado.",
      variant: "success",
    });
    expect(getRouteNotificationToast("desconocida")).toBeUndefined();
  });

  test("shows a known route notification toast from the shared registry", () => {
    expect(showRouteNotificationToast("evento-guardado")).toBe(true);

    expect(toastSuccess).toHaveBeenCalledWith("Evento guardado.", {
      id: "route-notification:evento-guardado",
    });
    expect(toastError).not.toHaveBeenCalled();
  });
});
