export type ErrorPropertyKey =
  | "code"
  | "constraint_name"
  | "detail"
  | "message";

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
