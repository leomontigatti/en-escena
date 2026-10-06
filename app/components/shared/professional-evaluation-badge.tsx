import { Badge } from "@/components/ui/badge";

/**
 * `Profesional`, beside the title of a presentation whose academy asked for a
 * professional evaluation. It is the whole of what the flag changes for the
 * judges, so it sits where they look last before the sheet: the heading of
 * the score dialog and sheet, and of administration's scores page. The lists
 * carry no mark. `null` otherwise, so a heading renders it unconditionally.
 */
function ProfessionalEvaluationBadge({
  professionalEvaluation,
}: {
  professionalEvaluation: boolean;
}) {
  if (!professionalEvaluation) {
    return null;
  }

  return <Badge variant="warning">Profesional</Badge>;
}

export { ProfessionalEvaluationBadge };
