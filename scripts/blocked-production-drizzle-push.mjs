console.error(
  [
    "Production Drizzle schema pushes are disabled.",
    "",
    "Use Supabase SQL migrations for production schema changes:",
    "  pnpm db:migration:new <name>",
    "  pnpm db:migration:dry-run",
    "  pnpm db:migration:advisors",
    "  pnpm db:migration:push",
    "",
    "See docs/db/production-schema-push.md.",
  ].join("\n"),
);

process.exit(1);
