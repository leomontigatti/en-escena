import { useEffect, type ReactNode } from "react";
import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form";
import { Link } from "react-router";

/**
 * What a roster form knows about a refused document number: the message for
 * the field, and the person already holding the number when the server named
 * one — an archived match above all, which is why the link exists.
 */
export type RosterDocumentConflict = {
  matchHref?: string;
  matchLabel?: string;
  message?: string;
};

/**
 * Lands the refusal on the document number field and returns the description
 * node for it. Documented exception to the style guide's "errors returned by
 * the server are not integrated with `form.setError`" rule
 * (docs/agents/style-guide.md § React Hook Form): PRD #1090 asks for this one
 * refusal on the field it is about, on every roster form. Every other server
 * answer these forms receive stays a toast.
 *
 * `actionData` is a dependency on purpose: a second identical refusal is a new
 * object, and that is what puts the message back after React Hook Form cleared
 * the errors while re-validating the resubmit.
 */
export function useRosterDocumentConflictField<
  TFieldValues extends FieldValues,
>({
  actionData,
  conflict,
  name,
  setError,
}: {
  actionData: unknown;
  conflict: RosterDocumentConflict;
  name: FieldPath<TFieldValues>;
  setError: UseFormSetError<TFieldValues>;
}): ReactNode {
  const { message } = conflict;

  useEffect(() => {
    if (!message) {
      return;
    }

    setError(name, { message, type: "server" });
  }, [actionData, message, name, setError]);

  if (!conflict.matchHref) {
    return undefined;
  }

  return (
    <Link
      className="text-primary underline-offset-4 hover:underline"
      to={conflict.matchHref}
    >
      {conflict.matchLabel}
    </Link>
  );
}
