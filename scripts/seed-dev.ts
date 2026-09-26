import { client } from "@/db";
import { assertLocalDatabaseUrl } from "@/lib/dev-seed/local-database-url";
import {
  DEV_SEED_ACADEMY_EMAIL,
  DEV_SEED_ADMIN_EMAIL,
  DEV_SEED_PASSWORD,
  seedDevData,
} from "@/lib/dev-seed/seed.server";

// `pnpm db:seed`: resets the demo accounts and events on the local database.
// Runbook: docs/local-auth.md, "Demo data".

assertLocalDatabaseUrl(process.env.DATABASE_URL);

try {
  const { deactivatedEventNames } = await seedDevData({ now: new Date() });

  for (const name of deactivatedEventNames) {
    console.log(`Deactivated "${name}" so the seeded event could be active.`);
  }

  console.log(`Seeded the local database. Password: ${DEV_SEED_PASSWORD}`);
  console.log(`  admin:   ${DEV_SEED_ADMIN_EMAIL}`);
  console.log(`  academy: ${DEV_SEED_ACADEMY_EMAIL}`);
} finally {
  await client.end();
}
