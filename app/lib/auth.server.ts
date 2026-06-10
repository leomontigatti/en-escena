import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendEmail } from "@/lib/email.server";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  session: {
    expiresIn: 8 * 60 * 60,
    updateAge: 30 * 60,
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Recuperá tu acceso a En Escena",
        text: `Usá este enlace para definir una nueva contraseña: ${url}`,
      });
    },
  },
});
