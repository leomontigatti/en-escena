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
  const url = new URL(request.url);

  return serveFilesystemObject({
    baseDir: getDefaultStorageVolumeDir(),
    now: Date.now(),
    params: url.searchParams,
    secret: getDefaultStorageUrlSigningSecret(),
  });
}
