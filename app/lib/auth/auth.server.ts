import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendEmail } from "@/lib/shared/email.server";

export const ACCESS_SESSION_EXPIRES_IN_SECONDS = 8 * 60 * 60;
export const ACCESS_SESSION_UPDATE_AGE_SECONDS = 30 * 60;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  session: {
    expiresIn: ACCESS_SESSION_EXPIRES_IN_SECONDS,
    updateAge: ACCESS_SESSION_UPDATE_AGE_SECONDS,
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Recuperá tu acceso a En Escena",
        text: `Usá este enlace para definir una nueva contraseña: ${url}`,
      });
    },
  },
});
