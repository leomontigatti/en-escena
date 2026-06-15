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
    expect(routeNotificationToasts["evento-guardado"]).toEqual({
      id: "route-notification:evento-guardado",
      message: "Evento guardado.",
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
