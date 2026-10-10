import { redirect } from "react-router";

import { handleVoterSignInStart } from "@/features/vote/sign-in.server";
import { votePath } from "@/lib/grand-final/vote-url";

import type { Route } from "./+types/votar_.google";

// A sign-in starts from the vote page's form, never from a link a browser
// might prefetch; a plain visit goes back to the page.
export function loader() {
  throw redirect(votePath);
}

export async function action({ request }: Route.ActionArgs) {
  return await handleVoterSignInStart(request);
}
