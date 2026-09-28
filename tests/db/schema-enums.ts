import { isPgEnum } from "drizzle-orm/pg-core";

import * as schema from "../../app/db/schema";

/**
 * The name of every enum the schema declares. The reset drops these by name
 * rather than by the `en_escena_` prefix alone, because not every enum carries
 * it: one left behind makes the next migrate fail on `create type`.
 */
export function listSchemaEnumNames() {
  return Object.values(schema)
    .flatMap((value: unknown) => (isPgEnum(value) ? [value.enumName] : []))
    .sort();
}
