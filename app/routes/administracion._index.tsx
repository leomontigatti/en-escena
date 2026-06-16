import { Link } from "react-router";
import {
  Building2,
  GraduationCap,
  Music2,
  ShieldUser,
  Users,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { Route } from "./+types/administracion._index";

export const meta: Route.MetaFunction = () => [
  { title: "Panel de administración | En Escena" },
];

export default function AdministracionIndexRoute() {
  return (
    <>
      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-foreground">
          Panel de administración
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Este panel concentra la operación del Evento, sus excepciones y la
          configuración principal.
        </p>
      </section>

      <nav
        className="grid gap-4 sm:grid-cols-2"
        aria-label="Accesos de administración"
      >
        {adminHomeCards.map((card) =>
          card.to ? (
            <Link
              key={card.title}
              to={card.to}
              className="group rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
            >
              <AdminHomeCard card={card} />
            </Link>
          ) : (
            <AdminHomeCard key={card.title} card={card} />
          ),
        )}
      </nav>
    </>
  );
}

const adminHomeCards = [
  {
    title: "Academias",
    description: "Placeholder para consulta y seguimiento de academias.",
    icon: Building2,
    to: null,
  },
  {
    title: "Profesores",
    description: "Consultá la ficha administrativa de cada Profesor.",
    icon: GraduationCap,
    to: "/administracion/profesores",
  },
  {
    title: "Bailarines",
    description:
      "Consultá datos, participación e identificación de Bailarines.",
    icon: Users,
    to: "/administracion/bailarines",
  },
  {
    title: "Coreografías",
    description: "Placeholder para revisión operativa de Coreografías.",
    icon: Music2,
    to: null,
  },
  {
    title: "Usuarios",
    description: "Creá accesos internos y administrá su ingreso inicial.",
    icon: ShieldUser,
    to: "/administracion/usuarios",
  },
] satisfies Array<{
  title: string;
  description: string;
  icon: typeof Building2;
  to: string | null;
}>;

type AdminHomeCardData = (typeof adminHomeCards)[number];

function AdminHomeCard({ card }: { card: AdminHomeCardData }) {
  const Icon = card.icon;

  return (
    <Card className="h-full rounded-lg transition-colors hover:bg-accent group-hover:bg-accent">
      <CardHeader className="grid-cols-[auto_1fr] items-center gap-4">
        <Avatar size="lg" className="rounded-lg after:rounded-lg">
          <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
            <Icon aria-hidden="true" />
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <CardTitle>{card.title}</CardTitle>
          <CardDescription>{card.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <span className="text-xs font-medium text-muted-foreground">
          {card.to ? "Acceso disponible" : "Próximamente"}
        </span>
      </CardContent>
    </Card>
  );
}
