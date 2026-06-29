import { pgEnum, pgTableCreator } from "drizzle-orm/pg-core";

export const createTable = pgTableCreator((name) => `en_escena_${name}`);

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

export const documentType = pgEnum("en_escena_document_type", [
  "dni",
  "passport",
  "other",
]);

export const financePaymentMethod = pgEnum("en_escena_finance_payment_method", [
  "transferencia",
  "efectivo",
  "mercado_pago",
  "otro",
]);

export const choreographyInvoiceType = pgEnum(
  "en_escena_choreography_invoice_type",
  ["sena", "saldo"],
);

export const choreographyCategoryCalculationMode = pgEnum(
  "en_escena_choreography_category_calculation_mode",
  ["oldest", "group_tolerance", "group_average"],
);

export const administrativeAuditEntityType = pgEnum(
  "en_escena_administrative_audit_entity_type",
  ["professor", "dancer", "choreography", "user"],
);

export const administrativeAuditAction = pgEnum(
  "en_escena_administrative_audit_action",
  [
    "create",
    "update",
    "archive",
    "reactivate",
    "reset-password",
    "verify-identity",
  ],
);
