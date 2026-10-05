import { Badge } from "@/components/ui/badge";
import {
  academyDataStatusBadgeVariants,
  academyDataStatusLabels,
  type AcademyDataStatus,
} from "@/lib/academies/academy-data-status";

/** Whether the academy's data is complete, as the list and the detail show it. */
export function AcademyDataStatusBadge({
  status,
}: {
  status: AcademyDataStatus;
}) {
  return (
    <Badge variant={academyDataStatusBadgeVariants[status]}>
      {academyDataStatusLabels[status]}
    </Badge>
  );
}
