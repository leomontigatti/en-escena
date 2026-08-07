import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigation } from "react-router";

/**
 * Los campos sueltos del detalle (submodalidad, cupo de cronograma) no editan
 * un form: muestran lo guardado. RHF sostiene la selección solo mientras el
 * envío está en vuelo, así que apenas se resuelve el campo vuelve a lo que dice
 * el loader.
 *
 * Sin esta re-sincronización un rechazo deja el select mostrando un valor que
 * no se escribió: `defaultValues` se lee una sola vez y la revalidación del
 * loader no lo toca. En el cupo de cronograma eso es mentir sobre una clave de
 * precio, y `schedule-capacity-full` es una carrera ordinaria que el indicio de
 * ocupación explícitamente no previene. Es lo que promete el comentario de
 * `ChoreographyFieldUpdateErrorData` en `shared.ts`.
 *
 * Reponer contra el loader al volver a `idle` cubre las dos salidas: si el
 * servidor aceptó, el loader ya trae el valor nuevo y el reset no se nota; si
 * rechazó, el campo vuelve solo.
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
