import {
  ACCESS_SESSION_EXPIRES_IN_SECONDS,
  ACCESS_SESSION_UPDATE_AGE_SECONDS,
  createLocalAccessUser,
  readLocalAccessSession,
  signInLocalAccessUser,
} from "@/lib/auth/access-test-auth.server";

export { ACCESS_SESSION_EXPIRES_IN_SECONDS, ACCESS_SESSION_UPDATE_AGE_SECONDS };

export const auth = {
  api: {
    async signInEmail(input: {
      body: {
        email: string;
        password: string;
      };
      headers?: Headers;
      returnHeaders?: boolean;
    }) {
      return signInLocalAccessUser({
        email: input.body.email,
        headers: input.headers,
        password: input.body.password,
      });
    },
    async signUpEmail(input: {
      body: {
        email: string;
        name: string;
        password: string;
      };
      headers?: Headers;
      returnHeaders?: boolean;
    }) {
      return createLocalAccessUser({
        email: input.body.email,
        headers: input.headers,
        name: input.body.name,
        password: input.body.password,
      });
    },
    async getSession(input: { headers: Headers }) {
      return readLocalAccessSession(input.headers);
    },
  },
};
