import { Badge } from "@/components/ui/badge";
import { awardLabels, type Award } from "@/lib/judging/award";

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
 * academy's. A disqualification takes the award's place; without either there
 * is none.
 */
export function AwardBadge({
  award,
  disqualified,
}: {
  award: Award | null;
  disqualified: boolean;
}) {
  if (disqualified) {
    return <Badge variant="destructive">Descalificada</Badge>;
  }

  return award === null ? null : (
    <Badge variant={awardBadgeVariants[award]}>{awardLabels[award]}</Badge>
  );
}
