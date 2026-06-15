import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { academies, internalInvitationTokens, user } from "@/db/schema";
import { auth } from "@/lib/auth/auth.server";
import {
  acceptInternalInvitation,
  createInternalInvitation,
} from "@/lib/admin/users/internal-invitation.server";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("internal invitations", () => {
  test("creates a verified internal user with one role and no academy", async () => {
    const admin = await db
      .insert(user)
      .values({
        email: "admin@example.com",
        name: "Administracion",
        emailVerified: true,
        role: "admin",
      })
      .returning();

    await createInternalInvitation(
      {
        email: "juez@example.com",
        role: "judge",
        invitedByUserId: admin[0]?.id ?? "",
        requestUrl:
          "http://localhost:3000/administracion/usuarios/invitaciones",
      },
      {
        createToken: () => "known-invitation-token",
        sendEmail: async () => {},
      },
    );

    const savedToken = await db.query.internalInvitationTokens.findFirst({
      where: eq(internalInvitationTokens.email, "juez@example.com"),
    });

    expect(savedToken).toMatchObject({
      email: "juez@example.com",
      role: "judge",
      consumedAt: null,
    });
    expect(savedToken?.tokenHash).not.toBe("known-invitation-token");

    const result = await acceptInternalInvitation({
      token: "known-invitation-token",
      password: "password123",
      request: new Request(
        "http://localhost:3000/invitacion/known-invitation-token",
      ),
    });

    expect(result.ok).toBe(true);

    const invitedUser = await db.query.user.findFirst({
      where: eq(user.email, "juez@example.com"),
    });

    expect(invitedUser).toMatchObject({
      emailVerified: true,
      role: "judge",
    });

    const savedAcademies = invitedUser
      ? await db.query.academies.findMany({
          where: eq(academies.userId, invitedUser.id),
        })
      : [];

    expect(savedAcademies).toEqual([]);

    await expect(
      auth.api.signInEmail({
        body: {
          email: "juez@example.com",
          password: "password123",
        },
      }),
    ).resolves.toMatchObject({
      user: { email: "juez@example.com" },
    });
  });
});
