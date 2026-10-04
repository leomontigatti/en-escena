import { Ellipsis } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ResourceActionsMenuProps = {
  children: ReactNode;
  contentClassName?: string;
};

export function ResourceActionsMenu({
  children,
  contentClassName = "w-56",
}: ResourceActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">
          <Ellipsis aria-hidden="true" data-icon="inline-start" />
          Acciones
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={contentClassName}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
