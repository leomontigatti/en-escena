import { ChevronRight, type LucideIcon } from "lucide-react";
import { Link } from "react-router";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type HomeAccessCardItem = {
  title: string;
  description: string;
  icon: LucideIcon;
  to: string | null;
};

export function HomeAccessCard({ item }: { item: HomeAccessCardItem }) {
  if (item.to) {
    return (
      <Link
        to={item.to}
        className="group flex h-full rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
      >
        <HomeAccessCardSurface item={item} />
      </Link>
    );
  }

  return <HomeAccessCardSurface item={item} />;
}

function HomeAccessCardSurface({ item }: { item: HomeAccessCardItem }) {
  const Icon = item.icon;

  return (
    <Card className="h-full w-full rounded-lg transition-colors hover:bg-accent group-hover:bg-accent">
      <CardHeader className="grid-cols-[auto_1fr] items-center gap-4">
        <Avatar size="lg" className="rounded-lg after:rounded-lg">
          <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
            <Icon aria-hidden="true" />
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <CardTitle>{item.title}</CardTitle>
          <CardDescription>{item.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="mt-auto flex justify-end">
        {item.to ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            Ir al listado
            <ChevronRight
              aria-hidden="true"
              className="size-3.5"
              data-icon="inline-end"
            />
          </span>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">
            Próximamente
          </span>
        )}
      </CardContent>
    </Card>
  );
}
