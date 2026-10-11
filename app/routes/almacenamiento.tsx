import { readRequestedUrl } from "@/lib/shared/requested-url.server";
import {
  getDefaultStorageUrlSigningSecret,
  getDefaultStorageVolumeDir,
  serveFilesystemObject,
} from "@/lib/storage/filesystem-client.server";

import type { Route } from "./+types/almacenamiento";

// Serves PII bytes from the local Coolify volume behind a short-lived HMAC
// token minted by `createFilesystemSignedUrl`. This replaces the presigned S3
// URL that pointed at B2 while B2 was the live store.
export async function loader({ request }: Route.LoaderArgs) {
  const url = readRequestedUrl(request);

  return serveFilesystemObject({
    baseDir: getDefaultStorageVolumeDir(),
    now: Date.now(),
    params: url.searchParams,
    range: request.headers.get("Range"),
    secret: getDefaultStorageUrlSigningSecret(),
  });
}
