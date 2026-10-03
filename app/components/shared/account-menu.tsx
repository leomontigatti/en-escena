import type { ReactNode } from "react";

import { LogoutMenuItem } from "@/components/shared/logout-menu-item";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AccountMenuProps = {
  /** The avatar's letters. */
  initials: string;
  /** Who is signed in: the first line of the menu's header. */
  name: string;
  /** The second line: the access email for an academy, the username for the panel. */
  detail: string;
  /** Items between the header and `Salir`, already grouped; none for the panel. */
  children?: ReactNode;
};

/**
 * The account menu of the admin and portal shells: a round avatar at the right
 * end of the top bar, as on GitHub. It used to be the sidebar's footer, where
 * neither an administrator nor an academy noticed it.
 */
export function AccountMenu({
  initials,
  name,
  detail,
  children,
}: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Cuenta: ${name}`}>
        <Avatar>
          <AvatarFallback className="bg-primary text-primary-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="grid gap-0.5 font-normal">
          <span className="truncate text-sm font-medium text-foreground">
            {name}
          </span>
          <span className="truncate">{detail}</span>
        </DropdownMenuLabel>
        {children ? (
          <>
            <DropdownMenuSeparator />
            {children}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <LogoutMenuItem />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
