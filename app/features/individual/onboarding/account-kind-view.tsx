import { Building2, UserRound, type LucideIcon } from "lucide-react";
import { Link } from "react-router";

import { AccessHeader, AccessPage } from "@/components/auth/access-ui";
import {
  PUBLIC_ACADEMY_ONBOARDING_PATH,
  PUBLIC_INDIVIDUAL_ONBOARDING_PATH,
} from "@/lib/auth/access-paths.shared";

const accountKinds = [
  {
    description:
      "Para cargar profesores, bailarines y coreografías, e inscribirlos en el evento.",
    Icon: Building2,
    title: "Academia",
    to: PUBLIC_ACADEMY_ONBOARDING_PATH,
  },
  {
    description:
      "Para vos, como persona: ver tu participación y tus resultados. Si es para un menor, abrí una cuenta por cada uno.",
    Icon: UserRound,
    title: "Particular",
    to: PUBLIC_INDIVIDUAL_ONBOARDING_PATH,
  },
] satisfies Array<{
  description: string;
  Icon: LucideIcon;
  title: string;
  to: string;
}>;

/**
 * The first onboarding step after the email is confirmed: the kind of account
 * (ADR-0019). Each choice opens its own form, and the academy's is the one it
 * always was.
 */
export function AccountKindRouteView() {
  return (
    <AccessPage width="lg">
      <AccessHeader
        eyebrow="Registro"
        title="¿Qué cuenta querés abrir?"
        description="Tu correo ya quedó confirmado. Cada correo es una sola cuenta: si ya tenés una con otro tipo, usá otro correo para esta."
      />

      <ul className="mt-8 flex flex-col gap-3">
        {accountKinds.map(({ description, Icon, title, to }) => (
          <li key={to}>
            <Link
              to={to}
              className="flex items-start gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Icon
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-primary"
              />
              <span className="flex flex-col gap-1">
                <span className="font-medium text-foreground">{title}</span>
                <span className="text-sm leading-6 text-muted-foreground">
                  {description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </AccessPage>
  );
}
