import { Loader2Icon } from "lucide-react";

import { cn } from "@/lib/shared/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label="Cargando"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
