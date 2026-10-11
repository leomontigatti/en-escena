// The demo accounts `pnpm db:seed` creates, one per role that can sign in, and
// their shared password. Kept apart from the seed itself so a script can name
// them without loading the database client.

export const DEV_SEED_ADMIN_EMAIL = "admin@enescena.local";
export const DEV_SEED_ACADEMY_EMAIL = "academia@enescena.local";
export const DEV_SEED_AUDITOR_EMAIL = "auditoria@enescena.local";
export const DEV_SEED_JUDGE_EMAIL = "jurado@enescena.local";
export const DEV_SEED_LEGACY_ACADEMY_EMAIL = "academia.antigua@enescena.local";
export const DEV_SEED_PASSWORD = "demo-en-escena";

/** The account `pnpm ui:session <role>` signs in as, by the role's name. */
export const DEV_SEED_ACCOUNTS = {
  admin: DEV_SEED_ADMIN_EMAIL,
  academy: DEV_SEED_ACADEMY_EMAIL,
  auditor: DEV_SEED_AUDITOR_EMAIL,
  judge: DEV_SEED_JUDGE_EMAIL,
} as const;
