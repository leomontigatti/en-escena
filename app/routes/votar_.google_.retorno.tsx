import { handleVoterSignInFinish } from "@/features/vote/sign-in.server";

import type { Route } from "./+types/votar_.google_.retorno";

// Where Google returns the visitor: the redirect URI registered with it.
export async function loader({ request }: Route.LoaderArgs) {
  return await handleVoterSignInFinish(request);
}
