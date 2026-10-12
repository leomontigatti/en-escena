import type { DataTableFacetedFilterOption } from "@/components/shared/data-table.shared";
import { Badge } from "@/components/ui/badge";
import {
  dancerVerificationStatusCodes,
  formatDancerVerificationStatusLabel,
  getDancerVerificationStatusBadgeVariant,
  type DancerVerificationStatusCode,
} from "@/lib/dancers/verification";

/** `Estado de verificación de bailarín` as a badge, the same on both lists. */
export function DancerVerificationBadge({
  code,
}: {
  code: DancerVerificationStatusCode;
}) {
  return (
    <Badge variant={getDancerVerificationStatusBadgeVariant(code)}>
      {formatDancerVerificationStatusLabel(code)}
    </Badge>
  );
}

/**
 * The `Verificación` facet of a dancer list, one option per status. Each list
 * says how it writes a status as a filter value: the admin list as its URL
 * value, the portal list as the code its client filter matches.
 */
export function buildDancerVerificationFacet(
  toValue: (code: DancerVerificationStatusCode) => string,
) {
  const choices = dancerVerificationStatusCodes.map((code) => ({
    code,
    value: toValue(code),
  }));

  return {
    label: "Verificación",
    options: choices.map(({ code, value }) => ({
      label: formatDancerVerificationStatusLabel(code),
      value,
    })),
    renderValue: (option: DataTableFacetedFilterOption) => {
      const choice = choices.find(({ value }) => value === option.value);

      return choice ? (
        <DancerVerificationBadge code={choice.code} />
      ) : (
        option.label
      );
    },
  };
}
