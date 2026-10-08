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
import { readFormString } from "@/lib/shared/forms";
import {
  createDefaultGrandFinalBannerStorage,
  loadGrandFinalBannerUrl,
  type GrandFinalBannerStorage,
} from "@/lib/storage/grand-final-banners.server";

import {
  bannerFieldNames,
  saveFinalistBannersIntent,
  type FinalistBannersActionData,
  type FinalistBannersLoaderData,
} from "./shared";

const notFinalistMessage =
  "Esa academia no es finalista de la Gran final del evento activo.";

/**
 * The banner form of one `finalist`, reached from its name on the `Gran
 * final` list. Behind `requireAdminPanelUser`, as the list is. An academy no
 * judge picked has no form: its banners, if it had any, wait for a pick.
 */
export async function loadFinalistBannersRouteData(
  request: Request,
  academyId: string,
  storage: GrandFinalBannerStorage = createDefaultGrandFinalBannerStorage(),
): Promise<FinalistBannersLoaderData> {
  await requireAdminPanelUser(request);
  const eventId = await requireSelectedEventId(request);
  const banners = await readFinalistBanners({ academyId, eventId });

  if (!banners) {
    throw new Response(notFinalistMessage, { status: 404 });
  }

  const [first, second] = await Promise.all(
    grandFinalBannerSlots.map((slot) =>
      loadGrandFinalBannerUrl({ storage, storageKey: banners.keys[slot] }),
    ),
  );

  return {
    academyId,
    academyName: banners.academyName,
    bannerUrls: { first, second },
    selectedEventId: eventId,
    values: {
      firstBannerStorageKey: banners.keys.first ?? "",
      secondBannerStorageKey: banners.keys.second ?? "",
    },
  };
}

/**
 * `Guardar` on the banner form. It stays: the answer goes back as data for a
 * toast and the form revalidates with the banners now stored.
 */
export async function handleFinalistBannersAction(
  request: Request,
  academyId: string,
  storage: GrandFinalBannerStorage = createDefaultGrandFinalBannerStorage(),
): Promise<FinalistBannersActionData | ReturnType<typeof data>> {
  await requireAdminPanelUser(request);
  const eventId = await requireSelectedEventId(request);
  const formData = await request.formData();

  if (readFormString(formData, "intent") !== saveFinalistBannersIntent) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const result = await saveFinalistBanners({
    academyId,
    changes: {
      first: readBannerChange(formData, "first"),
      second: readBannerChange(formData, "second"),
    },
    eventId,
    storage,
  });

  if (result.ok) {
    return { message: "Guardaste los banners.", status: "success" };
  }

  if (result.reason === "not-finalist") {
    return data(
      { message: notFinalistMessage, status: "error" as const },
      { status: 404 },
    );
  }

  return data(
    {
      message: formatBannerRejection(result.rejection, result.slot),
      status: "error" as const,
    },
    { status: 422 },
  );
}

async function requireSelectedEventId(request: Request) {
  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  if (!eventContext.selectedEventId) {
    throw redirect("/administracion/gran-final");
  }

  return eventContext.selectedEventId;
}

/**
 * A chosen file always wins. Without one, the stored key sent back keeps the
 * banner and an emptied one removes it; a body that carries neither field
 * keeps it, since reading a missing field as "remove" is the costly mistake.
 */
function readBannerChange(
  formData: FormData,
  slot: GrandFinalBannerSlot,
): BannerChange {
  const fields = bannerFieldNames[slot];
  const file = formData.get(fields.file);

  if (file instanceof File && file.size > 0) {
    return { file, kind: "upload" };
  }

  return formData.get(fields.storageKey) === ""
    ? { kind: "remove" }
    : { kind: "keep" };
}
