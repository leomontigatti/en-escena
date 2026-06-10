import { auth } from "@/lib/auth.server";

export async function signUpAcademyUser(input: {
  email: string;
  password: string;
  request: Request;
}) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: input.email,
      name: input.email,
      password: input.password,
      rememberMe: true,
    },
    headers: input.request.headers,
    returnHeaders: true,
  });

  return {
    userId: signUpResult.response.user.id,
    headers: signUpResult.headers,
  };
}
