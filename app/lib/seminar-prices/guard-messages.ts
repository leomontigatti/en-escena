import { getParticipantCellPhrase } from "@/lib/seminar-prices/participant-cells";

/**
 * The sentences the seminar price guards refuse with. They are said twice —
 * the form shows them before the submission, the repository answers with them
 * when a row moved in between — so they live outside the repository, where the
 * browser can read them without pulling the database in.
 */
export const frozenSeminarPriceUpdateError =
  "No se pueden editar monto, tipo de seminario, participantes ni fecha límite porque hay inscripciones que congelaron este precio.";
export const frozenSeminarPriceDeleteError =
  "No se puede borrar el precio porque hay inscripciones que congelaron este precio.";

// Same reading as the choreography guard's copy: the sentence states the two
// conditions —this is the cell's only row without a deadline, and the event
// carries active seminar inscriptions— without claiming that those inscriptions
// read this row. They may all have frozen onto a dated row and the refusal is
// still right, because nothing stops a later un-frozen inscription from landing
// on a cell with no price at all.
export function uncoveredSeminarPriceUpdateError(forParticipants: boolean) {
  return `No se puede editar el precio porque es el único Común sin fecha límite para ${getParticipantCellPhrase(forParticipants)}, y el evento tiene inscripciones a seminarios activas. Podés cambiarle el monto.`;
}

export function uncoveredSeminarPriceDeleteError(forParticipants: boolean) {
  return `No se puede borrar el precio porque es el único Común sin fecha límite para ${getParticipantCellPhrase(forParticipants)}, y el evento tiene inscripciones a seminarios activas.`;
}
