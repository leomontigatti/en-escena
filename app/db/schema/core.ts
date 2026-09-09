import { pgEnum, pgTableCreator, varchar } from "drizzle-orm/pg-core";

export const createTable = pgTableCreator((name) => `en_escena_${name}`);

/**
 * The primary key every table here carries: a `varchar(255)` holding a UUID the
 * application generates. The older tables spell it out column by column; new
 * ones call this instead, so the shape is stated once rather than copied.
 */
export function uuidPrimaryKey() {
  return varchar("id", { length: 255 })
    .primaryKey()
    .notNull()
    .$defaultFn(() => crypto.randomUUID());
}

export const userRole = pgEnum("en_escena_user_role", [
  "academy",
  "admin",
  "auditor",
  "judge",
]);

export const groupType = pgEnum("en_escena_group_type", [
  "solo",
  "duo",
  "trio",
  "grupal",
]);

export const experienceLevel = pgEnum("en_escena_experience_level", [
  "amateur",
  "profesional",
  "elite",
  "pre_elite",
  "pro_am",
  "nudo",
]);

export const documentType = pgEnum("en_escena_document_type", [
  "dni",
  "passport",
  "other",
]);
