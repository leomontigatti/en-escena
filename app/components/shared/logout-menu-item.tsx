import { LogOut } from "lucide-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

// The account menu's exit, shared by the admin and portal shells. The raw
// `<button>` is deliberate: it is the `asChild` child, so the menu item owns its
// look, and a native form posts to /salir even before hydration.
export function LogoutMenuItem() {
  return (
    <form action="/salir" method="post">
      <DropdownMenuItem asChild variant="destructive">
        <button type="submit" className="w-full">
          <LogOut aria-hidden="true" />
          Salir
        </button>
      </DropdownMenuItem>
    </form>
  );
}
