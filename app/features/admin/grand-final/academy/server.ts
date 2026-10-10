import { data, redirect } from "react-router";

import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import {
  formatBannerRejection,
  grandFinalBannerSlots,
  type GrandFinalBannerSlot,
} from "@/lib/grand-final/banner-shape";
import {
  readFinalistBanners,
  saveFinalistBanners,
  type BannerChange,
} from "@/lib/grand-final/banners.server";
import {
  checkAcademyFinalistPicks,
  setAcademyFinalistPicks,
  type AcademyModalityPicks,
  type SetAcademyFinalistPicksResult,
} from "@/lib/grand-final/finalist-pick.server";
import {
  readGrandFinalPicks,
  type GrandFinalPicks,
} from "@/lib/grand-final/picks-overview.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import { readFormString } from "@/lib/shared/forms";
import {
  createDefaultGrandFinalBannerStorage,
  loadGrandFinalBannerUrl,
  type GrandFinalBannerStorage,
} from "@/lib/storage/grand-final-banners.server";

import {
  bannerFieldNames,
  judgeIdsFieldName,
  judgeIdsPostedFieldName,
  saveAcademyGrandFinalIntent,
  type AcademyGrandFinalActionData,
  type AcademyGrandFinalLoaderData,
} from "./shared";

const notFinalistMessage =
  "Esa academia no es finalista de la Gran final del evento activo.";

const listPath = "/administracion/gran-final";

const notOnTheListMessage =
  "Esa academia no cumple los requisitos de la Gran final del evento activo en esa modalidad.";

/**
 * An academy's `Gran final` page in one modality, reached from its row on the
 * list: one for every row, eligible there or picked there. It holds the
 * judges who picked it in the modality and, once it is a `finalist` in any,
 * its banners, which are the academy's and the same on each of its pages.
 * Behind `requireAdminPanelUser`, as the list is.
 */
export async function loadAcademyGrandFinalRouteData(
  request: Request,
  { academyId, modalityId }: AcademyModalityParams,
  storage: GrandFinalBannerStorage = createDefaultGrandFinalBannerStorage(),
): Promise<AcademyGrandFinalLoaderData> {
  await requireAdminPanelUser(request);
  const eventId = await requireSelectedEventId(request);
  const picks = await readGrandFinalPicks(eventId);
  const { academy, modality } = requireAcademyModalityRow(picks, {
    academyId,
    modalityId,
  });

  const banners = await readFinalistBanners({ academyId, eventId });
  const [first, second] = await Promise.all(
    grandFinalBannerSlots.map((slot) =>
      loadGrandFinalBannerUrl({
        storage,
        storageKey: banners?.keys[slot] ?? null,
      }),
    ),
  );

  return {
    academyId,
    academyName: academy.name,
    bannerUrls: { first, second },
    eligible: academy.eligible,
    finalist: academy.finalist,
    judges: picks.judges,
    modalityId,
    modalityName: modality.modalityName,
    otherPicks: readOtherPicks(modality, academyId),
    selectedEventId: eventId,
    values: {
      firstBannerStorageKey: banners?.keys.first ?? "",
      judgeIds: academy.pickedByJudgeIds,
      secondBannerStorageKey: banners?.keys.second ?? "",
    },
  };
}

type AcademyModalityParams = { academyId: string; modalityId: string };

/**
 * The academy's row on the modality's list, which is what the page is: an
 * academy the list does not hold has no page there, to read or to save.
 */
function requireAcademyModalityRow(
  picks: GrandFinalPicks,
  { academyId, modalityId }: AcademyModalityParams,
) {
  const row = findAcademyModalityRow(picks, { academyId, modalityId });

  if (!row) {
    throw new Response(notOnTheListMessage, { status: 404 });
  }

  return row;
}

function findAcademyModalityRow(
  picks: GrandFinalPicks,
  { academyId, modalityId }: AcademyModalityParams,
) {
  const modality = picks.modalities.find(
    (row) => row.modalityId === modalityId,
  );
  const academy = modality?.academies.find(
    (row) => row.academyId === academyId,
  );

  return modality && academy ? { academy, modality } : null;
}

function readOtherPicks(
  modality: GrandFinalPicks["modalities"][number],
  academyId: string,
): AcademyGrandFinalLoaderData["otherPicks"] {
  return Object.fromEntries(
    modality.academies
      .filter((row) => row.academyId !== academyId)
      .flatMap((row) =>
        row.pickedByJudgeIds.map((judgeId) => [judgeId, row.name]),
      ),
  );
}

const pickRefusalMessages: Record<
  Extract<SetAcademyFinalistPicksResult, { ok: false }>["reason"],
  string
> = {
  "not-eligible":
    "La academia ya no cumple los requisitos en esta modalidad: solo se pueden quitar jueces. Revisá la página y volvé a intentarlo.",
  "not-found":
    "Un juez o la modalidad ya no están en el evento activo. Revisá la página y volvé a intentarlo.",
};

/**
 * `Guardar` on the academy's page. The judges the form posted are checked
 * first, then the banners stored, only when they change, then the judges
 * written: a refused picture or pick leaves the picks as they were. It stays:
 * the answer goes back as data for a toast and the page revalidates. A save
 * that takes the last judge off a modality the academy no longer qualifies
 * in takes it off that list, and its page with it: that one goes back to the
 * list, its toast in the flash session.
 */
export async function handleAcademyGrandFinalAction(
  request: Request,
  { academyId, modalityId }: AcademyModalityParams,
  storage: GrandFinalBannerStorage = createDefaultGrandFinalBannerStorage(),
): Promise<AcademyGrandFinalActionData | ReturnType<typeof data>> {
  await requireAdminPanelUser(request);
  const eventId = await requireSelectedEventId(request);
  const formData = await request.formData();

  if (readFormString(formData, "intent") !== saveAcademyGrandFinalIntent) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  requireAcademyModalityRow(await readGrandFinalPicks(eventId), {
    academyId,
    modalityId,
  });

  const picks = { academyId, picks: readPickChanges(formData, modalityId) };
  // The picks are checked before the banners are stored, so a save the picks
  // would refuse writes nothing; the write checks them again, under its lock.
  const refusal =
    pickRefusal(await checkAcademyFinalistPicks(picks)) ??
    (await saveBannerChanges(formData, { academyId, eventId, storage })) ??
    pickRefusal(await setAcademyFinalistPicks(picks));

  if (refusal) {
    return refusal;
  }

  if (
    !findAcademyModalityRow(await readGrandFinalPicks(eventId), {
      academyId,
      modalityId,
    })
  ) {
    throw await redirectWithFlashNotification(
      listPath,
      "grand-final-academy-left-modality",
    );
  }

  return { message: "Guardaste los cambios.", status: "success" };
}

/**
 * The banners the form changed, if any; a body that changes neither leaves
 * them alone, so the page of an academy no judge picked saves its picks.
 * Answers with the refusal, or nothing once they are stored.
 */
async function saveBannerChanges(
  formData: FormData,
  input: {
    academyId: string;
    eventId: string;
    storage: GrandFinalBannerStorage;
  },
) {
  const stored = await readFinalistBanners({
    academyId: input.academyId,
    eventId: input.eventId,
  });
  const changes = {
    first: readBannerChange(formData, "first", stored?.keys.first ?? null),
    second: readBannerChange(formData, "second", stored?.keys.second ?? null),
  };

  if (changes.first.kind === "keep" && changes.second.kind === "keep") {
    return null;
  }

  const result = await saveFinalistBanners({ ...input, changes });

  if (result.ok) {
    return null;
  }

  return result.reason === "not-finalist"
    ? data(
        { message: notFinalistMessage, status: "error" as const },
        { status: 404 },
      )
    : data(
        {
          message: formatBannerRejection(result.rejection, result.slot),
          status: "error" as const,
        },
        { status: 422 },
      );
}

/** The judges the form posted for the page's modality, none included. */
function readPickChanges(
  formData: FormData,
  modalityId: string,
): AcademyModalityPicks[] {
  if (!formData.has(judgeIdsPostedFieldName)) {
    return [];
  }

  return [
    {
      judgeIds: formData
        .getAll(judgeIdsFieldName)
        .filter((value): value is string => typeof value === "string"),
      modalityId,
    },
  ];
}

function pickRefusal(result: SetAcademyFinalistPicksResult) {
  return result.ok
    ? null
    : data(
        {
          message: pickRefusalMessages[result.reason],
          status: "error" as const,
        },
        { status: result.reason === "not-found" ? 404 : 409 },
      );
}

async function requireSelectedEventId(request: Request) {
  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  if (!eventContext.selectedEventId) {
    throw redirect(listPath);
  }

  return eventContext.selectedEventId;
}

/**
 * A chosen file always wins. Without one, the stored key sent back keeps the
 * banner and an emptied one removes it; a body that carries neither field
 * keeps it, since reading a missing field as "remove" is the costly mistake.
 * An emptied key where nothing is stored changes nothing: the form posts its
 * empty keys even when it shows no banner fields, before a judge's first pick.
 */
function readBannerChange(
  formData: FormData,
  slot: GrandFinalBannerSlot,
  storedKey: string | null,
): BannerChange {
  const fields = bannerFieldNames[slot];
  const file = formData.get(fields.file);

  if (file instanceof File && file.size > 0) {
    return { file, kind: "upload" };
  }

  return formData.get(fields.storageKey) === "" && storedKey !== null
    ? { kind: "remove" }
    : { kind: "keep" };
}
