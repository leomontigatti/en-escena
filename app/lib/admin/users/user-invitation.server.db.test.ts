import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { internalUserInvitations, user } from "@/db/schema";
import { hashRegistrationToken } from "@/lib/academies/registration-token.server";
import {
  completeInternalUserInvitation,
  getInternalInvitationTokenStatus,
  requestInternalUserInvitation,
} from "@/lib/admin/users/user-invitation.server";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

function extractTokenFromEmail(text: string) {
  const match = text.match(/\/invitacion\/([A-Za-z0-9_-]+)/);

  if (!match?.[1]) {
    throw new Error(`Invitation link was not found in email: ${text}`);
  }

  return match[1];
}

describe("internal user invitations", () => {
  function createCredentialUser() {
    return async ({ email }: { email: string }) => {
      await db.insert(user).values({
        id: crypto.randomUUID(),
        name: email,
        email,
      });

      const savedUser = await db.query.user.findFirst({
        where: eq(user.email, email),
      });

      if (!savedUser) {
        throw new Error("Expected test user to be created");
      }

      return { userId: savedUser.id, headers: new Headers() };
    };
  }

  test("creates and consumes an admin invitation without creating an academy", async () => {
    const sendEmail = vi.fn();

    await requestInternalUserInvitation(
      {
        email: " Admin.Invitado@Example.COM ",
        role: "admin",
        requestUrl: "http://localhost/admin/usuarios/invitaciones",
      },
      { sendEmail },
    );

    expect(sendEmail).toHaveBeenCalledWith({
      to: "admin.invitado@example.com",
      subject: "Te invitaron a En Escena",
      text: expect.stringContaining("http://localhost/invitacion/"),
    });

    const token = extractTokenFromEmail(sendEmail.mock.calls[0][0].text);
    const result = await completeInternalUserInvitation(
      {
        token,
        password: "password-segura",
        request: new Request("http://localhost/invitacion/test"),
      },
      { createCredentialUser: createCredentialUser() },
    );

    expect(result.ok).toBe(true);

    const invitedUser = await db.query.user.findFirst({
      where: eq(user.email, "admin.invitado@example.com"),
    });
    const savedAcademies = await db.query.academies.findMany();

    expect(invitedUser).toMatchObject({
      email: "admin.invitado@example.com",
      emailVerified: true,
      role: "admin",
    });
    expect(savedAcademies).toEqual([]);
  });

  test.each(["auditor", "judge"] as const)(
    "assigns exactly the invited %s role",
    async (role) => {
      const sendEmail = vi.fn();

      await requestInternalUserInvitation(
        {
          email: `${role}@example.com`,
          role,
          requestUrl: "http://localhost/admin/usuarios/invitaciones",
        },
        { sendEmail },
      );

      const token = extractTokenFromEmail(sendEmail.mock.calls[0][0].text);

      await completeInternalUserInvitation(
        {
          token,
          password: "password-segura",
          request: new Request("http://localhost/invitacion/test"),
        },
        { createCredentialUser: createCredentialUser() },
      );

      const invitedUser = await db.query.user.findFirst({
        where: eq(user.email, `${role}@example.com`),
      });

      expect(invitedUser?.role).toBe(role);
    },
  );

  test("rejects academy invitations", async () => {
    await expect(
      requestInternalUserInvitation({
        email: "academia@example.com",
        role: "academy" as "admin",
        requestUrl: "http://localhost/admin/usuarios/invitaciones",
      }),
    ).rejects.toThrow("La invitación interna no puede asignar academia.");
  });

  test("marks consumed invitations as invalid after first use", async () => {
    const sendEmail = vi.fn();

    await requestInternalUserInvitation(
      {
        email: "juez@example.com",
        role: "judge",
        requestUrl: "http://localhost/admin/usuarios/invitaciones",
      },
      { sendEmail },
    );

    const token = extractTokenFromEmail(sendEmail.mock.calls[0][0].text);

    expect(await getInternalInvitationTokenStatus(token)).toBe("valid");

    await completeInternalUserInvitation(
      {
        token,
        password: "password-segura",
        request: new Request("http://localhost/invitacion/test"),
      },
      { createCredentialUser: createCredentialUser() },
    );

    expect(await getInternalInvitationTokenStatus(token)).toBe("invalid");
    await expect(
      completeInternalUserInvitation(
        {
          token,
          password: "otra-password",
          request: new Request("http://localhost/invitacion/test"),
        },
        { createCredentialUser: createCredentialUser() },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: "El enlace no es válido o expiró.",
    });
  });

  test("rejects expired invitation links", async () => {
    const token = "expired-invitation-token";

    await db.insert(internalUserInvitations).values({
      email: "vencida@example.com",
      role: "auditor",
      tokenHash: hashRegistrationToken(token),
      expiresAt: new Date(Date.now() - 1_000),
    });

    expect(await getInternalInvitationTokenStatus(token)).toBe("invalid");
    await expect(
      completeInternalUserInvitation(
        {
          token,
          password: "password-segura",
          request: new Request("http://localhost/invitacion/test"),
        },
        { createCredentialUser: createCredentialUser() },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: "El enlace no es válido o expiró.",
    });
  });

  test("activates an existing internal user with the invited role", async () => {
    await db.insert(user).values({
      id: "existing_internal",
      name: "existing@example.com",
      email: "existing@example.com",
      role: "auditor",
      emailVerified: false,
    });

    const sendEmail = vi.fn();

    await requestInternalUserInvitation(
      {
        email: "existing@example.com",
        role: "judge",
        requestUrl: "http://localhost/admin/usuarios/invitaciones",
      },
      { sendEmail },
    );

    const token = extractTokenFromEmail(sendEmail.mock.calls[0][0].text);

    await completeInternalUserInvitation(
      {
        token,
        password: "password-segura",
        request: new Request("http://localhost/invitacion/test"),
      },
      {
        createCredentialUser: async ({ existingUserId }) => ({
          userId: existingUserId ?? "",
          headers: new Headers(),
        }),
      },
    );

    const activatedUser = await db.query.user.findFirst({
      where: eq(user.email, "existing@example.com"),
    });
    const users = await db.query.user.findMany();

    expect(activatedUser).toMatchObject({
      id: "existing_internal",
      emailVerified: true,
      role: "judge",
    });
    expect(users).toHaveLength(1);
  });

  test("does not activate an existing academy user", async () => {
    await db.insert(user).values({
      id: "academy_user",
      name: "academia@example.com",
      email: "academia@example.com",
      role: "academy",
      emailVerified: true,
    });

    const sendEmail = vi.fn();

    await requestInternalUserInvitation(
      {
        email: "academia@example.com",
        role: "admin",
        requestUrl: "http://localhost/admin/usuarios/invitaciones",
      },
      { sendEmail },
    );

    const token = extractTokenFromEmail(sendEmail.mock.calls[0][0].text);

    await expect(
      completeInternalUserInvitation(
        {
          token,
          password: "password-segura",
          request: new Request("http://localhost/invitacion/test"),
        },
        { createCredentialUser: createCredentialUser() },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: "Esta invitación no puede activar un usuario de academia.",
    });

    const academyUser = await db.query.user.findFirst({
      where: eq(user.email, "academia@example.com"),
    });
    const invitations = await db.query.internalUserInvitations.findMany();

    expect(academyUser?.role).toBe("academy");
    expect(invitations[0]?.consumedAt).toBeNull();
  });
});
