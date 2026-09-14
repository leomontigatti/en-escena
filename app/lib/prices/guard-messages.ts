/**
 * The sentences the choreography price guards refuse with. They are said twice
 * — the form shows them before the submission, the repository answers with
 * them when a row moved in between — so they live outside the repository,
 * where the browser can read them without pulling the database in.
 */
export const frozenPriceUpdateError =
  "No se pueden editar monto, tipo de grupo, vencimiento ni cronograma porque hay inscripciones que congelaron este precio.";
export const frozenPriceDeleteError =
  "No se puede borrar el precio porque hay inscripciones que congelaron este precio.";

// The guard tests two things — that this is the group type's only row with no
// deadline, and that the group type carries active inscriptions — but not that
// those inscriptions read this row. A group type whose inscriptions have all
// frozen onto another row is still refused, and correctly so: the roster admin
// path skips the readiness gate, so nothing else would stop a later un-frozen
// inscription from landing on an uncovered path. The copy therefore states the
// two conditions without claiming a dependency that may not hold.
export const uncoveredPriceUpdateError =
  "No se puede editar el precio porque es el único sin fecha límite de ese tipo de grupo, que tiene inscripciones activas. Podés cambiarle el monto.";
export const uncoveredPriceDeleteError =
  "No se puede borrar el precio porque es el único sin fecha límite de ese tipo de grupo, que tiene inscripciones activas.";
