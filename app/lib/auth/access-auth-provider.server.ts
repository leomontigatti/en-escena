import { auth } from "@/lib/auth/auth.server";

export const accessAuthProvider = {
  async getAccessSession(request: Request) {
    return await auth.api.getSession({
      headers: request.headers,
    });
  },

  async signInCredentialUser(input: {
    email: string;
    password: string;
    request: Request;
  }) {
    const result = await auth.api.signInEmail({
      body: {
        email: input.email,
        password: input.password,
      },
      headers: input.request.headers,
      returnHeaders: true,
    });

    return {
      userId: result.response.user.id,
      headers: result.headers,
    };
  },

  async signOutCurrentSession(request: Request) {
    const result = await auth.api.signOut({
      headers: request.headers,
      returnHeaders: true,
    });

    return {
      headers: result.headers,
    };
  },

  async signUpCredentialUser(input: {
    email: string;
    password: string;
    request: Request;
  }) {
    const result = await auth.api.signUpEmail({
      body: {
        email: input.email,
        name: input.email,
        password: input.password,
      },
      headers: input.request.headers,
      returnHeaders: true,
    });

    return {
      userId: result.response.user.id,
      headers: result.headers,
    };
  },

  async requestPasswordReset(input: {
    email: string;
    redirectTo: string;
    requestOrigin: string;
  }) {
    await auth.api.requestPasswordReset({
      body: {
        email: input.email,
        redirectTo: input.redirectTo,
      },
      headers: new Headers({
        origin: input.requestOrigin,
      }),
    });
  },

  async resetPassword(input: {
    token: string;
    newPassword: string;
    request: Request;
  }) {
    await auth.api.resetPassword({
      body: {
        token: input.token,
        newPassword: input.newPassword,
      },
      headers: input.request.headers,
    });
  },
};
