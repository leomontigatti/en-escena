import { CalendarDays } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const enEscenaAvatarSrc = "/avatar-white-dark-bg.png";

export function EnEscenaAvatar() {
  return (
    <Avatar className="rounded-lg after:rounded-lg">
      <AvatarImage src={enEscenaAvatarSrc} alt="" className="rounded-lg" />
      <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <CalendarDays aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  );
}
