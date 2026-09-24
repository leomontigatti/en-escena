import { AccessTextLink } from "@/components/auth/access-ui";
import { DuplicateWarningPrompt } from "@/components/shared/duplicate-warning-prompt";
import type { AcademyNameMatch } from "@/lib/academies/academy-name-duplicates";
import { formatBusinessDate } from "@/lib/shared/business-time-zone";

type AcademyNameWarningNoticeProps = {
  matches: readonly AcademyNameMatch[];
};

export function AcademyNameWarningNotice({
  matches,
}: AcademyNameWarningNoticeProps) {
  return (
    <DuplicateWarningPrompt matchIds={matches.map((match) => match.id)}>
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
