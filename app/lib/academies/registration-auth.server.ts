import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";

export async function signUpAcademyUser(input: {
  email: string;
  password: string;
  request: Request;
}) {
  return accessAuthProvider.signUpCredentialUser(input);
}
