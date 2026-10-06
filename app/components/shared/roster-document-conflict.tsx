import { useEffect } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

/**
 * What a roster form knows about a refused document number: what the server
 * said about it, and the person already holding the number when the server
 * named one — an archived match above all, which is why the link exists.
 */
export type RosterDocumentConflict = {
  matchHref?: string;
  message?: string;
};

/**
 * Toasts a roster form's refusal, as every server refusal is (style guide
 * § React Hook Form). A document conflict says which number is taken instead
 * of the generic refusal, and the toast links to the person holding it.
 *
 * `refusal` is the action's answer itself, so the toast fires once per answer
 * and again for a second identical refusal.
 */
export function useRosterRefusalToast({
  conflict,
  refusal,
  toastId,
}: {
  conflict: RosterDocumentConflict;
  refusal: { message: string } | null | undefined;
  toastId: string;
}) {
  const navigate = useNavigate();
  const { matchHref, message } = conflict;

  useEffect(() => {
    if (!refusal) {
      return;
    }

    window.setTimeout(() => {
      toast.error(message ?? refusal.message, {
        id: toastId,
        action: matchHref
          ? { label: "Ver ficha", onClick: () => void navigate(matchHref) }
          : undefined,
      });
    }, 0);
  }, [matchHref, message, navigate, refusal, toastId]);
}
