import { Badge } from "@/components/ui/badge";
import {
  awardLabels,
  type Award,
  type PresentationResult,
} from "@/lib/judging/award";

const awardBadgeVariants: Record<
  Award,
  "info" | "outline" | "secondary" | "warning"
> = {
  bronze: "outline",
  gold: "warning",
  silver: "secondary",
  specialMention: "info",
};

/**
 * A presentation's award as every surface shows it, administration's and the
 * academy's. A disqualification takes the award's place; an unscored
 * presentation has none.
 */
export function AwardBadge({ result }: { result: PresentationResult }) {
  if (result.kind === "disqualified") {
    return <Badge variant="destructive">Descalificada</Badge>;
  }

  return result.kind === "scored" ? (
    <Badge variant={awardBadgeVariants[result.award]}>
      {awardLabels[result.award]}
    </Badge>
  ) : null;
}
