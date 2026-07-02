import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/shared/utils";

function BadgesList({
  className,
  labels,
}: {
  className?: string;
  labels: string[];
}) {
  if (labels.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {labels.map((label, index) => (
        <Badge key={`${label}-${index}`} variant="secondary">
          {label}
        </Badge>
      ))}
    </div>
  );
}

export { BadgesList };
