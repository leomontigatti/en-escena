import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * An icon-only button whose name also shows as a tooltip on hover and focus.
 * Ghost and icon-sized unless the caller says otherwise; `asChild` wraps a
 * link, which takes no `type`.
 */
export function TooltipIconButton({
  asChild,
  label,
  size = "icon",
  variant = "ghost",
  ...buttonProps
}: Omit<ComponentProps<typeof Button>, "aria-label"> & {
  label: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type={asChild ? undefined : "button"}
            asChild={asChild}
            variant={variant}
            size={size}
            aria-label={label}
            {...buttonProps}
          />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
