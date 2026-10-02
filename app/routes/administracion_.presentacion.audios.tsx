import { loadMusicDownload } from "@/features/admin/presentations/music-download/server";

import type { Route } from "./+types/administracion_.presentacion.audios";

// A resource route: the day's music as one zip, downloaded from the
// participation list's actions menu.
export async function loader({ request }: Route.LoaderArgs) {
  return await loadMusicDownload(request);
}
