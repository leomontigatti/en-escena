import { AccessTextLink } from "@/components/auth/access-ui";
import { DuplicateWarningPrompt } from "@/components/shared/duplicate-warning-prompt";
import type { AcademyNameMatch } from "@/lib/academies/academy-name-duplicates";
import { formatBusinessDate } from "@/lib/shared/business-time-zone";

type AcademyNameWarningDialogProps = {
  formId: string;
  matches: readonly AcademyNameMatch[];
};

export function AcademyNameWarningDialog({
  formId,
  matches,
}: AcademyNameWarningDialogProps) {
  return (
    <DuplicateWarningPrompt
      formId={formId}
      matchIds={matches.map((match) => match.id)}
      title="¿Es tu academia?"
      warning={matches}
    >
      {matches.map((match) => (
        <p key={match.id}>
          Ya existe una academia llamada «{match.name}», registrada el{" "}
          {formatBusinessDate(match.createdAt)}. Si es la tuya,{" "}
          <AccessTextLink to="/ingresar">ingresá con esa cuenta</AccessTextLink>{" "}
          o{" "}
          <AccessTextLink to="/recuperar-acceso">
            recuperá la contraseña
          </AccessTextLink>
          . Si es otra academia con el mismo nombre, continuá.
        </p>
      ))}
    </DuplicateWarningPrompt>
  );
}
