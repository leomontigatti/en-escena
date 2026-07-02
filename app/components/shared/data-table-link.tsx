import type { ComponentProps } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

type DataTableLinkProps = ComponentProps<typeof Link>;

function DataTableLink({ children, ...props }: DataTableLinkProps) {
  return (
    <Button asChild variant="link" className="h-auto p-0 text-left">
      <Link {...props}>{children}</Link>
    </Button>
  );
}

export { DataTableLink };
