import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

import { reportUnexpectedClientError } from "@/lib/shared/unexpected-error-log";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter
        onError={(error, { pattern }) => {
          reportUnexpectedClientError(error, { pattern });
        }}
      />
    </StrictMode>,
  );
});
