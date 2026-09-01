import { Ellipsis } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ResourceActionsMenuProps = {
  children: ReactNode;
  contentClassName?: string;
  contentProps?: Omit<
    ComponentProps<typeof DropdownMenuContent>,
    "align" | "children" | "className" | "onCloseAutoFocus"
  >;
  label?: string;
  size?: ComponentProps<typeof Button>["size"];
  /**
   * Where the tooltip sits. Defaults to the left, which is empty in the
   * detail-view headers this menu was written for; a surface that puts another
   * control there has to move it or the tooltip covers that control.
   */
  tooltipSide?: ComponentProps<typeof TooltipContent>["side"];
};

export function ResourceActionsMenu({
  children,
  contentClassName = "w-56",
  contentProps,
  label = "Acciones",
  size = "icon-lg",
  tooltipSide = "left",
}: ResourceActionsMenuProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleTooltipOpenChange = (open: boolean) => {
    if (open && isDropdownOpen) {
      return;
    }

    setIsTooltipOpen(open);
  };

  const handleDropdownOpenChange = (open: boolean) => {
    setIsDropdownOpen(open);

    if (open) {
      setIsTooltipOpen(false);
    }
  };

  const preventTriggerFocusAfterDropdownClose = (event: Event) => {
    event.preventDefault();
    triggerRef.current?.blur();
    setIsTooltipOpen(false);
  };

  return (
    <TooltipProvider>
      <Tooltip open={isTooltipOpen} onOpenChange={handleTooltipOpenChange}>
        <DropdownMenu
          open={isDropdownOpen}
          onOpenChange={handleDropdownOpenChange}
        >
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                ref={triggerRef}
                type="button"
                variant="outline"
                size={size}
                aria-describedby={tooltipId}
                aria-label={label}
              >
                <Ellipsis aria-hidden="true" />
                <span className="sr-only">{label}</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <DropdownMenuContent
            align="end"
            className={contentClassName}
            onCloseAutoFocus={preventTriggerFocusAfterDropdownClose}
            {...contentProps}
          >
            {children}
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipContent id={tooltipId} side={tooltipSide} sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
