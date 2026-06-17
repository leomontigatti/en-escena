import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";

export async function signUpAcademyUser(input: {
  email: string;
  password: string;
  request: Request;
}) {
  return accessAuthProvider.registerAcademyAccessUser(input);
}

export async function deleteAcademyUserAccess(userId: string) {
  await accessAuthProvider.deleteAccessUser(userId);
}
