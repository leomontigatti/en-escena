import { Lock } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/shared/utils";

function FieldLockIcon({ className, ...props }: ComponentProps<typeof Lock>) {
  return (
    <Lock
      aria-hidden="true"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

function FieldControlLockIcon({ className }: { className?: string }) {
  return (
    <FieldLockIcon
      className={cn(
        "pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2",
        className,
      )}
    />
  );
}

export { FieldControlLockIcon, FieldLockIcon };
