import type { ReactNode } from "react";
import { Link } from "react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/shared/utils";

type MetricCardProps = {
  title: string;
  value: string;
  // An optional slot (a badge) shown next to the title (ADR-0011). Without a
  // slot, the card shows only the title and the value.
  slot?: ReactNode;
  // When provided, the whole card is a link to that destination, with the same
  // hover and focus as the panel's cards (HomeAccessCard). `linkLabel` names the
  // link for screen readers.
  to?: string;
  linkLabel?: string;
};

export function MetricCard({
  title,
  value,
  slot,
  to,
  linkLabel,
}: MetricCardProps) {
  const surface = (
    <Card
      className={cn(
        to &&
          "h-full w-full transition-colors hover:bg-accent group-hover:bg-accent",
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {slot ?? null}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );

  if (!to) {
    return surface;
  }

  return (
    <Link
      to={to}
      aria-label={linkLabel}
      className="group flex h-full rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
    >
      {surface}
    </Link>
  );
}
