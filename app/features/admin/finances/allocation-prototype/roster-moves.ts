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
            },
          }
        : row,
    ),
  };
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

/** A soft withdrawal (decision 21). May drop a dancer below their tier. */
export function withdrawSibling(
  state: PrototypeState,
  inscriptionId: string,
): PrototypeState {
  return {
    ...state,
    inscriptions: state.inscriptions.map((row) =>
      row.id === inscriptionId ? { ...row, withdrawnAt: "2026-08-06" } : row,
    ),
  };
}
