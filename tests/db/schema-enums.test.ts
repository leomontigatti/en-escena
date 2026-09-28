import { describe, expect, test } from "vitest";

import { listSchemaEnumNames } from "./schema-enums";

describe("schema enum names", () => {
  // `event_document_kind` predates the prefix and survived every reset that
  // only dropped `en_escena_*` enums, so re-applying migration 0013 failed on
  // any test database that already existed.
  test("lists the enums the schema declares, prefixed or not", () => {
    const enumNames = listSchemaEnumNames();

    expect(enumNames).toContain("event_document_kind");
    expect(enumNames).toContain("en_escena_user_role");
  });
});
