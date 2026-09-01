import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigation } from "react-router";

/**
 * The detail's standalone fields (submodality, schedule capacity) do not edit a
 * form: they show what is saved. RHF holds the selection only while the
 * submission is in flight, so as soon as it resolves the field goes back to what
 * the loader says.
 *
 * Without this resynchronization a rejection leaves the select showing a value
 * that was not written: `defaultValues` is read once and the loader's
 * revalidation does not touch it. On the schedule capacity that means lying
 * about a price key, and `schedule-capacity-full` is an ordinary race that the
 * occupancy hint explicitly does not prevent. It is what the comment on
 * `ChoreographyFieldUpdateErrorData` in `shared.ts` promises.
 *
 * Restoring against the loader on the return to `idle` covers both exits: if the
 * server accepted, the loader already carries the new value and the reset goes
 * unnoticed; if it rejected, the field reverts on its own.
 */
export function useSavedValueSelectForm(name: string, savedValue: string) {
  const form = useForm<Record<string, string>>({
    defaultValues: { [name]: savedValue },
  });
  const isIdle = useNavigation().state === "idle";

  useEffect(() => {
    if (isIdle) {
      form.reset({ [name]: savedValue });
    }
  }, [form, isIdle, name, savedValue]);

  return form;
}
