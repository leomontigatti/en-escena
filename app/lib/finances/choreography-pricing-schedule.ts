/**
 * Fuentes del cronograma de una coreografía: el cronograma del cupo asignado
 * (`schedule_capacity`) y el cronograma propio (`schedule_id`).
 */
export type ChoreographyScheduleSources = {
  choreographyScheduleId: string | null;
  scheduleCapacityScheduleId: string | null;
};

/**
 * El cronograma que define el precio de una coreografía. Prefiere el cronograma
 * del cupo asignado; cuando la coreografía usa la capacidad total del cronograma
 * no hay cupo, y cae al `schedule_id` propio. Ambas fuentes apuntan al mismo
 * cronograma, del que dependen las filas de precio, así que resolver el precio
 * y cotizarlo o cobrarlo tienen que usar esta misma regla para no divergir.
 */
export function resolveChoreographyPricingScheduleId(
  sources: ChoreographyScheduleSources,
): string | null {
  return sources.scheduleCapacityScheduleId ?? sources.choreographyScheduleId;
}
