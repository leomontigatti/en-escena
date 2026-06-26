import { describe, expect, test, vi } from "vitest";

const requireAcademyUserMock = vi.hoisted(() => vi.fn());
const requestAccessRecoveryEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/internal-access.server", () => ({
  requireAcademyUser: requireAcademyUserMock,
}));

vi.mock("@/lib/auth/access-recovery.server", () => ({
  requestAccessRecoveryEmail: requestAccessRecoveryEmailMock,
}));

import { handlePortalProfileAction } from "@/features/portal/profile/server";

describe("portal profile action", () => {
  test("requests password recovery for the signed-in academy user email", async () => {
    requestAccessRecoveryEmailMock.mockResolvedValue({
      message:
        "Si el correo corresponde a un usuario existente, enviamos un enlace para recuperar el acceso.",
    });
    requireAcademyUserMock.mockResolvedValue({
      user: { email: "portal@example.com" },
      academy: {
        id: "academy_1",
        name: "Academia de Prueba",
        contactName: "Contacto",
        phone: "1112345678",
      },
    });

    const formData = new FormData();
    formData.set("intent", "request-password-recovery");
    formData.set("email", "otro@example.com");

    const result = await handlePortalProfileAction(
      new Request("http://localhost/portal/perfil", {
        method: "POST",
        body: formData,
      }),
    );

    expect(requestAccessRecoveryEmailMock).toHaveBeenCalledWith({
      email: "portal@example.com",
      request: expect.any(Request),
      requestUrl: "http://localhost/portal/perfil",
    });
    expect(result).toMatchObject({
      data: {
        status: "success",
        message:
          "Si el correo corresponde a un usuario existente, enviamos un enlace para recuperar el acceso.",
      },
    });
  });
});
