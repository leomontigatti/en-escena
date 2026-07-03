import { Children, type ComponentProps } from "react";

import { cn } from "@/lib/shared/utils";

export function AlertStack({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  const alerts = Children.toArray(children);

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-3", className)} {...props}>
      {alerts}
    </div>
  );
}
