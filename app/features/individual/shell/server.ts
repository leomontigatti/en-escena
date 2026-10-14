import { requireIndividualUser } from "@/lib/auth/internal-access.server";
import { toIndividualFullName } from "@/lib/individuals/personal-data";

export async function loadIndividualShell(request: Request) {
  const { user, individual } = await requireIndividualUser(request);

  return {
    email: user.email,
    fullName: toIndividualFullName(individual),
  };
}
