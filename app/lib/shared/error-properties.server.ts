export type ErrorPropertyKey =
  "code" | "constraint_name" | "detail" | "message";

export function readErrorProperty(error: unknown, key: ErrorPropertyKey) {
  let current: unknown = error;

  while (current && typeof current === "object") {
    if (key in current) {
      const propertyValue = current[key as keyof typeof current];

      if (propertyValue !== null && typeof propertyValue !== "object") {
        const stringValue = String(propertyValue);

        if (stringValue) {
          return stringValue;
        }
      }
    }

    const cause = "cause" in current ? current.cause : null;
    current = cause && typeof cause === "object" ? cause : null;
  }

  return null;
}

// Postgres SQLSTATE classes the repo refuses on: a duplicate row
// (`unique_violation`) and a row still referenced elsewhere
// (`foreign_key_violation`).
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

// Narrowing by constraint name is optional: some call sites only care that the
// driver refused, others need to tell one constraint apart from another.
function isSqlStateViolation(
  error: unknown,
  sqlState: string,
  constraintName?: string,
) {
  if (readErrorProperty(error, "code") !== sqlState) {
    return false;
  }

  return (
    constraintName === undefined ||
    readErrorProperty(error, "constraint_name") === constraintName
  );
}

export function isUniqueViolation(error: unknown, constraintName?: string) {
  return isSqlStateViolation(error, UNIQUE_VIOLATION, constraintName);
}

export function isForeignKeyViolation(error: unknown, constraintName?: string) {
  return isSqlStateViolation(error, FOREIGN_KEY_VIOLATION, constraintName);
}
