// PROTOTYPE — throwaway, do not merge
//
// The public Gran final vote page (variant A: stacked cards with a 16:9 photo
// carousel); `?estado=votado&academia=<id>` shows the confirmation. In-memory
// data, no loader, no action.
import { useSearchParams } from "react-router";

import { VariantA, VotedState } from "@/features/prototype-vote/variants";

export const meta = () => [{ title: "Votar | Gran final (prototipo)" }];

export default function PrototypeVoteRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const voted = searchParams.get("estado") === "votado";

  function onVote(finalistId: string) {
    setSearchParams((params) => {
      params.set("estado", "votado");
      params.set("academia", finalistId);
      return params;
    });
    window.scrollTo(0, 0);
  }

  return voted ? (
    <VotedState finalistId={searchParams.get("academia")} />
  ) : (
    <VariantA onVote={onVote} />
  );
}
