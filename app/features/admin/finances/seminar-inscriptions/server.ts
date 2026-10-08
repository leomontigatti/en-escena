import {
  runSeminarInscriptionMoneyIntent,
  type SeminarMoneyAnswer,
} from "@/features/admin/finances/inscription-money/seminar-money-action.server";
import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import {
  readSeminarInscriptionPriceOptions,
  type SeminarInscriptionPriceOption,
} from "@/lib/finances/seminar-inscription-allocation.server";
import {
  readSeminarInscriptionFinanceRows,
  type SeminarInscriptionFinanceDetailRow,
} from "@/lib/finances/seminar-inscriptions.server";

/**
 * Every seminar inscription of the event, across academies: who owes what for
 * seminars without opening each `(seminar, academy)` detail. The rows are the
 * detail's own, read event-wide, so the two views of the same money cannot
 * disagree.
 *
 * A withdrawn inscription stays while it still holds money, because that money
 * is still the academy's in the seminar and the row is where it can be taken
 * off. Once it holds nothing it has nothing left to say on a list about debt.
 */
export async function loadSeminarInscriptionFinances(request: Request) {
  await requireInternalUser(request, ["admin"]);
  const eventContext = await loadEventContext(request);
  const eventId = eventContext.selectedEventId;

  if (eventId === null) {
    return {
      inscriptions: [] as SeminarInscriptionFinanceDetailRow[],
      priceOptionsByInscription: {} as Record<
        string,
        SeminarInscriptionPriceOption[]
      >,
      selectedEventId: null,
    };
  }

  const [rows, priceOptions] = await Promise.all([
    readSeminarInscriptionFinanceRows({ eventId }),
    readSeminarInscriptionPriceOptions({ eventId }),
  ]);
  const inscriptions = rows.filter(
    (row) => !row.withdrawn || row.allocatedAmount > 0,
  );

  return {
    inscriptions,
    // A plain object rather than the `Map` the reader answers: it has to
    // survive the loader's serialization on its way to the view.
    priceOptionsByInscription: Object.fromEntries(
      inscriptions.map((inscription) => [
        inscription.inscriptionId,
        priceOptions.get(inscription.inscriptionId) ?? [],
      ]),
    ),
    selectedEventId: eventId,
  };
}

/**
 * The money dialog's three gestures, posted from the list. A write that went
 * through stays on the list (form-feedback: a dialog over a list does not
 * redirect): the loader revalidates, the row shows its new figures and the
 * success is toasted.
 */
export async function handleSeminarInscriptionFinancesAction(
  request: Request,
): Promise<SeminarMoneyAnswer> {
  await requireAdminUser(request);
  const eventContext = await loadEventContext(request);

  if (eventContext.selectedEventId === null) {
    return {
      status: "error",
      message: "Activá un evento para operar las inscripciones.",
    };
  }

  return await runSeminarInscriptionMoneyIntent({
    eventId: eventContext.selectedEventId,
    formData: await request.formData(),
  });
}
