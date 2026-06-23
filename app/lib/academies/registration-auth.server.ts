import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";

export async function startAcademyUserSignUp(input: {
  email: string;
  password: string;
  redirectTo: string;
  request: Request;
}) {
  return accessAuthProvider.startEmailSignUp(input);
}
