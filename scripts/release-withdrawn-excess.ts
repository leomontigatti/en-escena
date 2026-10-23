import { client } from "@/db";
import { releaseWithdrawnExcess } from "@/lib/finances/withdrawn-excess-cleanup.server";

// The one-time cleanup that ships with #1065: releases what every withdrawn
// inscription holds above the deposit it retains. A dry run by default, which
// rolls each row back and lists what it would release; `--apply` releases it.
// Idempotent: a second run finds nothing. Delete it once it has run in
// production.
//
//   node --env-file-if-exists=.env --import tsx scripts/release-withdrawn-excess.ts [--apply]
const apply = process.argv.includes("--apply");

try {
  const releases = await releaseWithdrawnExcess({ apply });
  const total = releases.reduce(
    (sum, release) => sum + release.releasedAmount,
    0,
  );

  for (const release of releases) {
    console.log(
      `${release.kind} ${release.inscriptionId} academy=${release.academyId} ` +
        `event=${release.eventId} held=${release.heldAmount} released=${release.releasedAmount}`,
    );
  }

  console.log(
    `${apply ? "released" : "would release"} ${total} across ${releases.length} withdrawn inscriptions`,
  );
} finally {
  await client.end();
}
