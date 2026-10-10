import type { ComponentProps } from "react";
import { Link } from "react-router";

import { useRecordTitleLink } from "@/components/shared/record-title";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

type DataTableLinkProps = ComponentProps<typeof Link> & {
  /**
   * The link names the row's record and opens its detail page: its text
   * morphs into that page's title and back. One per row, in the column that
   * identifies the record.
   */
  recordTitle?: boolean;
};

function DataTableLink({
  children,
  className,
  recordTitle,
  ...props
}: DataTableLinkProps) {
  return (
    <Button
      asChild
      variant="link"
      className={cn("h-auto p-0 text-left", className)}
    >
      {recordTitle ? (
        <RecordTitleLink {...props}>{children}</RecordTitleLink>
      ) : (
        <Link {...props}>{children}</Link>
      )}
    </Button>
  );
}

function RecordTitleLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} {...useRecordTitleLink(props.to)} />;
}

export { DataTableLink };
