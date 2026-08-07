export type ScheduleCapacitySelectOption = {
  id: string;
  /**
   * Sin lugar disponible. La vista lo traduce a `disabled`, que queda
   * reservado exclusivamente para esto: la cuenta corre carrera con cualquier
   * otra asignación, así que la opción gris es una pista, no una barrera, y el
   * rechazo del servidor sigue siendo la única garantía.
   */
  isFull: boolean;
  label: string;
};

/**
 * `disabled` está reservado exclusivamente para el cupo lleno: ninguna otra
 * causa apaga una opción suelta —el bloqueo financiero, por ejemplo, cierra el
 * campo entero— así que la opción gris tiene un único significado. Y como la
 * ocupación es una foto que corre carrera con otras asignaciones, es una pista:
 * el rechazo del servidor sigue siendo la garantía.
 *
 * Administración y el portal arman sus opciones acá, para que las dos
 * superficies no puedan divergir.
 */
export function toScheduleCapacitySelectOptions(
  options: readonly ScheduleCapacitySelectOption[],
) {
  return options.map((option) => ({
    disabled: option.isFull,
    label: option.label,
    value: option.id,
  }));
}

/**
 * Un select donde no hay nada elegible es un callejón sin salida silencioso:
 * el portal, que registra en lugar de corregir, lo reemplaza por un mensaje
 * que dice por qué.
 */
export function isEveryScheduleCapacityOptionFull(
  options: readonly ScheduleCapacitySelectOption[],
) {
  return options.length > 0 && options.every((option) => option.isFull);
}
