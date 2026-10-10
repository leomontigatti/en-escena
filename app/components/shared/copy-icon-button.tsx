import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/** How long the copy button shows its confirmation before reverting. */
const COPIED_FEEDBACK_MS = 2000;

/**
 * Inline feedback, never a toast: copying never reaches the server, and toasts
 * are reserved for server-confirmed results. The clipboard receives the stored
 * value exactly, and the confirmation waits for the write to land: on a
 * non-secure context the API is present but rejects, and announcing `copiado`
 * over a CBU or a link that never reached the clipboard is the failure that
 * matters. A silent no-op is the better one.
 */
export function CopyIconButton({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(
      () => setCopied(false),
      COPIED_FEEDBACK_MS,
    );

    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? `${label} copiado` : `Copiar ${label}`}
      onClick={() => {
        navigator.clipboard
          ?.writeText(value)
          .then(() => setCopied(true))
          // A refused write leaves the icon unchanged, and the user can press again.
          .catch(() => {});
      }}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
    </Button>
  );
}
