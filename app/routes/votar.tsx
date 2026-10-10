import { handleVoteAction, loadVotePage } from "@/features/vote/server";
import { VotePageView } from "@/features/vote/view";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/votar";

export const meta = () => [{ title: "Gran final | Votación | En Escena" }];

// The loader's and the action's `no-store` reach the page itself too: it
// holds the visitor's code.
export function headers({ actionHeaders, loaderHeaders }: Route.HeadersArgs) {
  return actionHeaders.has("Cache-Control") ? actionHeaders : loaderHeaders;
}

export async function loader({ request }: Route.LoaderArgs) {
  return await loadVotePage(request);
}

export async function action({ request }: Route.ActionArgs) {
  return await handleVoteAction(request);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function VoteRoute({ loaderData }: Route.ComponentProps) {
  return <VotePageView page={loaderData} />;
}
