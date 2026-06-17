import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";

export async function signUpAcademyUser(input: {
  email: string;
  password: string;
  request: Request;
}) {
  const signUpResult = await accessAuthProvider.signUpCredentialUser(input);

  return {
    userId: signUpResult.userId,
    headers: signUpResult.headers,
  };
}
