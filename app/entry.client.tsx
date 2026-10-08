import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

import { reportUnexpectedClientError } from "@/lib/shared/unexpected-error-log";

// Read once, before hydration: the page the server rendered names the release
// this bundle belongs to. The root loader refreshes the tag after a deploy,
// while the bundle already running stays the old one.
const release =
  document
    .querySelector<HTMLMetaElement>('meta[name="release"]')
    ?.getAttribute("content") || "unknown";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter
        onError={(error, { pattern }) => {
          reportUnexpectedClientError(error, { pattern, release });
        }}
      />
    </StrictMode>,
  );
});
