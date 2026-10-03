import { Bell, SunMoon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The two controls to the left of the account menu in both shells. Neither
 * does anything yet: the theme switch is disabled until there is a dark theme
 * to switch to, and the bell opens a placeholder until notifications exist.
 */
export function TopBarTools() {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            {/* A disabled button fires no pointer events, so the tooltip
                hangs off a wrapper that still does. */}
            <span
              aria-disabled="true"
              aria-label="Cambiar el tema"
              className="inline-flex"
              role="button"
              tabIndex={0}
            >
              <Button
                aria-hidden="true"
                disabled
                size="icon"
                tabIndex={-1}
                variant="ghost"
              >
                <SunMoon aria-hidden="true" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Tema claro u oscuro, próximamente</TooltipContent>
        </Tooltip>
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button aria-label="Notificaciones" size="icon" variant="ghost">
                  <Bell aria-hidden="true" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Notificaciones</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-72">
            <p className="text-sm text-muted-foreground">
              No tenés notificaciones nuevas.
            </p>
          </PopoverContent>
        </Popover>
      </div>
    </TooltipProvider>
  );
}
