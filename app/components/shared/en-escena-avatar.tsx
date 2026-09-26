import { CalendarDays } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const enEscenaAvatarSrc = "/avatar-white-dark-bg.png";

export function EnEscenaAvatar() {
  return (
    <Avatar shape="square">
      <AvatarImage src={enEscenaAvatarSrc} alt="" />
      <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">
        <CalendarDays aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  );
}
