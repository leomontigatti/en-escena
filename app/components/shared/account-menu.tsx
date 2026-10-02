import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AccountMenuProps = {
  /** The avatar's letters. */
  initials: string;
  /** Who is signed in, as the first line of the trigger. */
  name: string;
  /** The second line: the academy for the portal, the role for the panel. */
  detail: string;
  /** The menu's items, grouped and separated by the caller. */
  children: ReactNode;
};

/**
 * The account menu of the admin and portal shells, at the right end of the top
 * bar. It used to be the sidebar's footer, where neither an administrator nor
 * an academy noticed it: the top-right corner is where people look for who they
 * are and how to leave.
 */
export function AccountMenu({
  initials,
  name,
  detail,
  children,
}: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`Cuenta: ${name}`}
          className="ml-auto h-auto max-w-72 px-2 py-1.5"
        >
          <Avatar shape="square">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 text-left leading-tight sm:grid">
            <span className="truncate font-medium">{name}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {detail}
            </span>
          </span>
          <ChevronDown aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
