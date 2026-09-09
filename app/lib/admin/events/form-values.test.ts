import { describe, expect, test } from "vitest";

import {
  defaultEventFormValues,
  eventFormValues,
  paymentInstructionsMessages,
  parseEventFormValues,
  readEventFormValues,
  registrationAfterEventStartMessage,
  type EventRow,
} from "@/lib/admin/events/form-values";

function eventValues(overrides: Record<string, string> = {}) {
  return {
    ...defaultEventFormValues(),
    name: "En Escena 2027",
    registrationStartsAt: "2027-04-01",
    registrationEndsAt: "2027-04-20",
    startsAt: "2027-05-01",
    endsAt: "2027-05-03",
    requiredDepositPercentage: "30",
    ...overrides,
  };
}

describe("parseEventFormValues", () => {
  test("accepts inscriptions that open before the event", () => {
    expect(parseEventFormValues(eventValues()).ok).toBe(true);
  });

  // The same schema backs `zodResolver`, so this is also what the field shows
  // before the form is ever submitted.
  test("refuses inscriptions that open after the event starts", () => {
    const result = parseEventFormValues(
      eventValues({ registrationStartsAt: "2027-05-02" }),
    );

    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        registrationStartsAt: registrationAfterEventStartMessage,
      },
    });
  });

  test("accepts inscriptions that open the day the event starts", () => {
    const result = parseEventFormValues(
      eventValues({ registrationStartsAt: "2027-05-01" }),
    );

    expect(result.ok).toBe(true);
  });
});

const VALID_CBU = "0070099330004512345678";
const VALID_CUIT = "30-71234567-1";

function parseInstructions(overrides: Record<string, string> = {}) {
  return parseEventFormValues(eventValues(overrides));
}

describe("payment instructions on the event form", () => {
  test("defaults every field to an empty string", () => {
    expect(defaultEventFormValues()).toMatchObject({
      paymentInstructionsCbu: "",
      paymentInstructionsAlias: "",
      paymentInstructionsHolderName: "",
      paymentInstructionsBankName: "",
      paymentInstructionsHolderCuit: "",
      paymentInstructionsText: "",
    });
  });

  test("reads every field off the submitted form data", () => {
    const formData = new FormData();

    formData.set("paymentInstructionsCbu", VALID_CBU);
    formData.set("paymentInstructionsAlias", "Mi.Alias-01");
    formData.set("paymentInstructionsHolderName", "En Escena SRL");
    formData.set("paymentInstructionsBankName", "Banco Nación");
    formData.set("paymentInstructionsHolderCuit", VALID_CUIT);
    formData.set("paymentInstructionsText", "Poné tu academia.");

    expect(readEventFormValues(formData)).toMatchObject({
      paymentInstructionsCbu: VALID_CBU,
      paymentInstructionsAlias: "Mi.Alias-01",
      paymentInstructionsHolderName: "En Escena SRL",
      paymentInstructionsBankName: "Banco Nación",
      paymentInstructionsHolderCuit: VALID_CUIT,
      paymentInstructionsText: "Poné tu academia.",
    });
  });

  // A body that never carried the fields — the create page's — reads as empty
  // rather than as a missing key.
  test("reads absent fields as empty strings", () => {
    expect(readEventFormValues(new FormData())).toMatchObject({
      paymentInstructionsCbu: "",
      paymentInstructionsText: "",
    });
  });

  test("turns a stored event into empty strings when nothing is loaded", () => {
    expect(eventFormValues(storedEvent())).toMatchObject({
      paymentInstructionsCbu: "",
      paymentInstructionsAlias: "",
      paymentInstructionsHolderName: "",
      paymentInstructionsBankName: "",
      paymentInstructionsHolderCuit: "",
      paymentInstructionsText: "",
    });
  });

  test("round-trips a loaded event through the form values", () => {
    const event = storedEvent({
      paymentInstructionsCbu: VALID_CBU,
      paymentInstructionsAlias: "mi.alias-01",
      paymentInstructionsHolderName: "En Escena SRL",
      paymentInstructionsBankName: "Banco Nación",
      paymentInstructionsHolderCuit: VALID_CUIT,
      paymentInstructionsText: "Poné tu academia.",
    });

    const parsed = parseEventFormValues({
      ...eventValues(),
      ...eventFormValues(event),
    });

    expect(parsed).toMatchObject({
      ok: true,
      input: {
        paymentInstructionsCbu: VALID_CBU,
        paymentInstructionsAlias: "mi.alias-01",
        paymentInstructionsHolderName: "En Escena SRL",
        paymentInstructionsBankName: "Banco Nación",
        paymentInstructionsHolderCuit: VALID_CUIT,
        paymentInstructionsText: "Poné tu academia.",
      },
    });
  });

  test("stores an empty field as null", () => {
    const parsed = parseInstructions();

    expect(parsed).toMatchObject({
      ok: true,
      input: {
        paymentInstructionsCbu: null,
        paymentInstructionsAlias: null,
        paymentInstructionsHolderName: null,
        paymentInstructionsBankName: null,
        paymentInstructionsHolderCuit: null,
        paymentInstructionsText: null,
      },
    });
  });

  test("stores the alias lowercased and the free text trimmed", () => {
    const parsed = parseInstructions({
      paymentInstructionsCbu: VALID_CBU,
      paymentInstructionsHolderName: "  En Escena SRL  ",
      paymentInstructionsAlias: "Mi.Alias-01",
      paymentInstructionsText: "  Poné tu academia.  ",
    });

    expect(parsed).toMatchObject({
      ok: true,
      input: {
        paymentInstructionsAlias: "mi.alias-01",
        paymentInstructionsHolderName: "En Escena SRL",
        paymentInstructionsText: "Poné tu academia.",
      },
    });
  });

  // The CUIT is stored as typed so the portal can render the hyphens the
  // administrator chose.
  test("stores the CUIT as typed", () => {
    const parsed = parseInstructions({
      paymentInstructionsCbu: VALID_CBU,
      paymentInstructionsHolderName: "En Escena SRL",
      paymentInstructionsHolderCuit: " 30712345671 ",
    });

    expect(parsed).toMatchObject({
      ok: true,
      input: { paymentInstructionsHolderCuit: "30712345671" },
    });
  });

  test("accepts an event with nothing but the free text", () => {
    expect(
      parseInstructions({ paymentInstructionsText: "Transferí y avisá." }).ok,
    ).toBe(true);
  });

  test("asks for both the number and the holder when only the alias is filled", () => {
    expect(parseInstructions({ paymentInstructionsAlias: "mi.alias" })).toEqual(
      {
        ok: false,
        fieldErrors: {
          paymentInstructionsCbu: paymentInstructionsMessages.missingCbu,
          paymentInstructionsHolderName:
            paymentInstructionsMessages.missingHolderName,
        },
      },
    );
  });

  test("asks for the holder when only the number is filled", () => {
    expect(parseInstructions({ paymentInstructionsCbu: VALID_CBU })).toEqual({
      ok: false,
      fieldErrors: {
        paymentInstructionsHolderName:
          paymentInstructionsMessages.missingHolderName,
      },
    });
  });

  test("asks for the number when only the holder is filled", () => {
    expect(
      parseInstructions({ paymentInstructionsHolderName: "En Escena SRL" }),
    ).toEqual({
      ok: false,
      fieldErrors: {
        paymentInstructionsCbu: paymentInstructionsMessages.missingCbu,
      },
    });
  });

  test.each([
    [
      "a short CBU/CVU",
      { paymentInstructionsCbu: VALID_CBU.slice(0, 21) },
      "paymentInstructionsCbu",
      paymentInstructionsMessages.cbuLength,
    ],
    [
      "a mistyped CBU/CVU digit",
      { paymentInstructionsCbu: `1${VALID_CBU.slice(1)}` },
      "paymentInstructionsCbu",
      paymentInstructionsMessages.mistypedDigit,
    ],
    [
      "a misplaced CUIT hyphen",
      { paymentInstructionsHolderCuit: "3-071234567-1" },
      "paymentInstructionsHolderCuit",
      paymentInstructionsMessages.cuitShape,
    ],
    [
      "a mistyped CUIT digit",
      { paymentInstructionsHolderCuit: "30712345670" },
      "paymentInstructionsHolderCuit",
      paymentInstructionsMessages.mistypedDigit,
    ],
    [
      "a short alias",
      { paymentInstructionsAlias: "abc" },
      "paymentInstructionsAlias",
      paymentInstructionsMessages.alias,
    ],
    [
      "an alias with a space",
      { paymentInstructionsAlias: "mi alias" },
      "paymentInstructionsAlias",
      paymentInstructionsMessages.alias,
    ],
    [
      "instructions over the cap",
      { paymentInstructionsText: "a".repeat(2001) },
      "paymentInstructionsText",
      paymentInstructionsMessages.textLength,
    ],
  ])("refuses %s", (_case, overrides, field, message) => {
    const parsed = parseInstructions({
      paymentInstructionsCbu: VALID_CBU,
      paymentInstructionsHolderName: "En Escena SRL",
      ...overrides,
    });

    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? undefined : parsed.fieldErrors[field as "name"]).toBe(
      message,
    );
  });

  test("accepts instructions exactly at the cap", () => {
    expect(
      parseInstructions({ paymentInstructionsText: "a".repeat(2000) }).ok,
    ).toBe(true);
  });

  // The cap counts what the column stores, and the column stores it trimmed —
  // so does the admin panel's live counter.
  test("counts the cap after trimming, and stores the trimmed text", () => {
    const parsed = parseInstructions({
      paymentInstructionsText: `  ${"a".repeat(2000)}\n  `,
    });

    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.input.paymentInstructionsText : null).toBe(
      "a".repeat(2000),
    );
  });
});

function storedEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "event-1",
    name: "En Escena 2027",
    active: false,
    programVisible: false,
    resultsVisible: false,
    requiredDepositPercentage: 30,
    registrationStartsAt: new Date("2027-04-01T03:00:00Z"),
    registrationEndsAt: new Date("2027-04-20T03:00:00Z"),
    startsAt: new Date("2027-05-01T03:00:00Z"),
    endsAt: new Date("2027-05-03T03:00:00Z"),
    registrationReady: false,
    registrationReadinessMissingItems: [],
    registrationReadinessDirty: true,
    registrationReadinessCalculatedAt: null,
    paymentInstructionsCbu: null,
    paymentInstructionsAlias: null,
    paymentInstructionsHolderName: null,
    paymentInstructionsBankName: null,
    paymentInstructionsHolderCuit: null,
    paymentInstructionsText: null,
    createdAt: new Date("2026-01-01T03:00:00Z"),
    ...overrides,
  };
}
