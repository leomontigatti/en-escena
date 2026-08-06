/**
 * THROWAWAY PROTOTYPE — ticket #585 of map #547.
 *
 * The three gestures that move a bill from outside it: emitting the factura,
 * and registering or withdrawing a dancer in **another** choreography. None of
 * them touches the choreography on screen, which is the whole point — its total
 * moves anyway, and after emission the movement owes a document.
 */
import { readInscriptions, type PrototypeState } from "./fixtures";

/**
 * Bills a choreography at its currently derived amounts (decision 15), one line
 * per inscription at the **net** amount (#554). Everything after this is
 * measured against it: the discount keeps moving, and the gap between what the
 * document says and what is derived now is what owes an ND or an NC (#599).
 */
export function emitComprobante(
  state: PrototypeState,
  choreographyId: string,
): PrototypeState {
  const inscriptions = readInscriptions(state).filter(
    (row) => row.choreographyId === choreographyId,
  );
  const number =
    412 + state.choreographies.filter((row) => row.comprobante).length;

  return {
    ...state,
    choreographies: state.choreographies.map((row) =>
      row.id === choreographyId
        ? {
            ...row,
            comprobante: {
              label: `Factura C 0003-${String(number).padStart(8, "0")}`,
              emittedOn: "2026-08-02",
              lines: inscriptions.map((inscription) => ({
                inscriptionId: inscription.id,
                amount: inscription.totalAmount,
              })),
              amendments: [],
            },
          }
        : row,
    ),
  };
}

/**
 * Emits the ND or the NC the delta owes (#599). The **sign names the document**,
 * so there is one gesture and never a choice: positive is a nota de débito,
 * negative a nota de crédito.
 *
 * Emitting it re-documents the lines at what is derived now, which is what
 * closes the delta — the amendment chain is a star anchored at the factura, so
 * what the papers say together is always the current reading.
 */
export function emitAmendment(
  state: PrototypeState,
  choreographyId: string,
): PrototypeState {
  const choreography = state.choreographies.find(
    (row) => row.id === choreographyId,
  );

  if (choreography?.comprobante == null) {
    return state;
  }

  const inscriptions = readInscriptions(state).filter(
    (row) => row.choreographyId === choreographyId,
  );
  const derivedTotal = inscriptions.reduce(
    (total, row) => total + row.totalAmount,
    0,
  );
  const documentedTotal = choreography.comprobante.lines.reduce(
    (total, line) => total + line.amount,
    0,
  );
  const delta = derivedTotal - documentedTotal;

  if (delta === 0) {
    return state;
  }

  const number = 500 + countAmendments(state);

  return {
    ...state,
    choreographies: state.choreographies.map((row) =>
      row.id === choreographyId && row.comprobante !== null
        ? {
            ...row,
            comprobante: {
              ...row.comprobante,
              lines: inscriptions.map((inscription) => ({
                inscriptionId: inscription.id,
                amount: inscription.totalAmount,
              })),
              amendments: [
                ...row.comprobante.amendments,
                {
                  label: `${delta > 0 ? "Nota de débito" : "Nota de crédito"} C 0003-${String(number).padStart(8, "0")}`,
                  amount: delta,
                },
              ],
            },
          }
        : row,
    ),
  };
}

function countAmendments(state: PrototypeState) {
  return state.choreographies.reduce(
    (total, row) => total + (row.comprobante?.amendments.length ?? 0),
    0,
  );
}

/** A sibling registration elsewhere. May raise a dancer's tier — and lower a bill. */
export function registerSibling(
  state: PrototypeState,
  dancerId: string,
  choreographyId: string,
): PrototypeState {
  const existing = state.inscriptions.find(
    (row) => row.dancerId === dancerId && row.choreographyId === choreographyId,
  );

  // Decision 21's amendment: re-adding revives the withdrawn row.
  if (existing !== undefined) {
    return {
      ...state,
      inscriptions: state.inscriptions.map((row) =>
        row.id === existing.id ? { ...row, withdrawnAt: null } : row,
      ),
    };
  }

  const choreography = state.choreographies.find(
    (row) => row.id === choreographyId,
  );

  return {
    ...state,
    inscriptions: [
      ...state.inscriptions,
      {
        id: `ins-${dancerId}-${choreographyId}`,
        choreographyId,
        dancerId,
        selectedPriceId:
          choreography?.defaultPriceId ?? state.prices[0]?.id ?? "",
        withdrawnAt: null,
      },
    ],
  };
}

/**
 * Removal from a roster. **Conditional** (decision 21 as amended by #600): with
 * money or an invoice line on it the inscription is withdrawn and stays
 * readable; with neither there is nothing to preserve, so it is deleted
 * outright. Either way the dancer may drop below their tier.
 */
export function withdrawSibling(
  state: PrototypeState,
  inscriptionId: string,
): PrototypeState {
  const hasEvidence =
    state.allocations.some(
      (allocation) => allocation.inscriptionId === inscriptionId,
    ) ||
    state.choreographies.some((choreography) =>
      choreography.comprobante?.lines.some(
        (line) => line.inscriptionId === inscriptionId,
      ),
    );

  if (!hasEvidence) {
    return {
      ...state,
      inscriptions: state.inscriptions.filter(
        (row) => row.id !== inscriptionId,
      ),
    };
  }

  return {
    ...state,
    inscriptions: state.inscriptions.map((row) =>
      row.id === inscriptionId ? { ...row, withdrawnAt: "2026-08-06" } : row,
    ),
  };
}
