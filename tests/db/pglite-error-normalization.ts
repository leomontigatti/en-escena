type MutableRecord = Record<string, unknown>;

export function normalizePgliteError(error: unknown) {
  if (!error || typeof error !== "object") {
    return error;
  }

  const record = error as MutableRecord;

  copyConstraintName(record);

  if (record.cause && typeof record.cause === "object") {
    normalizePgliteError(record.cause);
  }

  return error;
}

function copyConstraintName(record: MutableRecord) {
  if (
    "constraint_name" in record ||
    !("constraint" in record) ||
    typeof record.constraint !== "string" ||
    record.constraint.length === 0
  ) {
    return;
  }

  record.constraint_name = record.constraint;
}
