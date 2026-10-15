import {
  formatGroupTypeLabel,
  type ChoreographyGroupType,
} from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

/**
 * A choreography's category with its group type, "Juvenil · Solo", as every
 * list and card writes the pair.
 */
export function formatCategoryAndGroupType(
  categoryName: string,
  groupType: ChoreographyGroupType,
) {
  return formatPrimaryAndSecondaryValue(
    categoryName,
    formatGroupTypeLabel(groupType),
  );
}
