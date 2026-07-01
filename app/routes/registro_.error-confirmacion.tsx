import { AccessHeader, AccessPage } from "@/components/auth/access-ui";
import { AccessSecondaryLink } from "@/components/auth/access-ui";

import type { Route } from "./+types/registro_.error-confirmacion";

export const meta: Route.MetaFunction = () => [
  { title: "Confirmación inválida | En Escena" },
];

export default function RegistrationConfirmationErrorRoute() {
  return (
    <AccessPage>
      <AccessHeader
        eyebrow="Enlace inválido"
        title="No pudimos confirmar tu correo"
        tone="danger"
        description="El enlace ya fue usado o expiró. Pedí uno nuevo para registrar la academia."
      />

      <AccessSecondaryLink to="/registro" className="mt-8 w-full">
        Pedir nuevo enlace
      </AccessSecondaryLink>
    </AccessPage>
  );
}
