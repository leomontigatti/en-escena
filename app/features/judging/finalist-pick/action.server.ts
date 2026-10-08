import {
  type FinalistPickRefusal,
  saveFinalistPick,
} from "@/lib/grand-final/finalist-pick.server";
import { readFormString } from "@/lib/shared/forms";

import { finalistPickSchema, saveFinalistPickIntent } from "./shared";

/**
 * The judge's save of a `finalistPick`, posted from the bottom of their list
 * through a fetcher. Like a score it stays: the answer goes back as data, the
 * list revalidates and shows the pick. See docs/agents/form-feedback.md.
 *
 * A modality outside the active event is not something the list can offer, so
 * it is a 404; every other refusal is an ordinary thing to run into mid-show,
 * a day that closed or an academy withdrawn since the page loaded, and is told
 * as a toast.
 */

export type FinalistPickActionData = {
  intent: typeof saveFinalistPickIntent;
  message: string;
  status: "success" | "error";
};

const savedFinalistPickMessage = "Guardaste la elección de finalista.";

const finalistPickRefusalMessages: Record<
  Exclude<FinalistPickRefusal, "not-found">,
  string
> = {
  closed: "La jornada ya cerró, no se puede cambiar la elección de finalista.",
  "not-eligible":
    "Esa academia no cumple los requisitos de la Gran final en esta modalidad. Elegí otra.",
  "not-started":
    "La jornada de esta modalidad todavía no empezó, no se puede elegir finalista.",
};

export async function handleFinalistPickAction(
  judgeId: string,
  formData: FormData,
): Promise<FinalistPickActionData> {
  const intent = saveFinalistPickIntent;
  const parsed = finalistPickSchema.safeParse({
    academyId: readFormString(formData, "academyId"),
    modalityId: readFormString(formData, "modalityId"),
  });

  if (!parsed.success) {
    return {
      intent,
      message: "Elegí una academia para guardar la elección de finalista.",
      status: "error",
    };
  }

  const result = await saveFinalistPick({ ...parsed.data, judgeId });

  if (result.ok) {
    return { intent, message: savedFinalistPickMessage, status: "success" };
  }

  if (result.reason === "not-found") {
    throw new Response("Not Found", { status: 404 });
  }

  return {
    intent,
    message: finalistPickRefusalMessages[result.reason],
    status: "error",
  };
}
