// PROTOTYPE (#1652) — throwaway. Run after `pnpm db:seed`: fills `Río Arriba`
// with dancers, publishes the results, and opens a linked individual for Caro.
import { and, eq, inArray } from "drizzle-orm";

import { client, db } from "@/db";
import {
  academies,
  choreographies,
  choreographyDancers,
  dancers,
  events,
  individuals,
  user,
} from "@/db/schema";
import { createAccessUser } from "@/lib/auth/access-auth.test-support";
import { assertLocalDatabaseUrl } from "@/lib/dev-seed/local-database-url";
import { publishResults } from "@/lib/judging/results.server";

assertLocalDatabaseUrl(process.env.DATABASE_URL);
const [event] = await db.select().from(events).where(eq(events.active, true));
const [academy] = await db
  .select()
  .from(academies)
  .where(eq(academies.name, "Academia Demo"));
const roster = await db
  .select()
  .from(dancers)
  .where(eq(dancers.academyId, academy.id));
const byName = (first: string) => roster.find((d) => d.firstName === first)!;
const chor = await db
  .select()
  .from(choreographies)
  .where(eq(choreographies.academyId, academy.id));
const rio = chor.find((c) => c.name === "Río Arriba")!;
const viento = chor.find((c) => c.name === "Viento Sur")!;
const luna = chor.find((c) => c.name === "Luna de Papel")!;

const extra = [
  ["Martina", "Albornoz"],
  ["Sofía", "Benítez Larrañaga"],
  ["Julieta", "Ferreyra"],
  ["Valentina", "Quiroga"],
];
const extraIds: string[] = [];
for (const [firstName, lastName] of extra) {
  const [row] = await db
    .insert(dancers)
    .values({ academyId: academy.id, firstName, lastName, birthDate: "2010-01-01" })
    .returning();
  extraIds.push(row.id);
}
const add = async (choreographyId: string, dancerIds: string[]) => {
  const existing = await db
    .select()
    .from(choreographyDancers)
    .where(
      and(
        eq(choreographyDancers.choreographyId, choreographyId),
        inArray(choreographyDancers.dancerId, dancerIds),
      ),
    );
  const missing = dancerIds.filter(
    (id) => !existing.some((row) => row.dancerId === id),
  );
  if (missing.length > 0) {
    await db.insert(choreographyDancers).values(
      missing.map((dancerId) => ({ choreographyId, dancerId, ageAtEventStart: 16 })),
    );
  }
};
await add(rio.id, [byName("Ana").id, byName("Dani").id, ...extraIds]);
await add(viento.id, [byName("Caro").id]);
await add(luna.id, [byName("Caro").id]);
await db
  .update(dancers)
  .set({ documentType: "dni", documentNumber: "45123456" })
  .where(eq(dancers.id, byName("Caro").id));

await publishResults(event.id);

const email = "particular@enescena.local";
await db.delete(user).where(eq(user.email, email));
const { user: created } = await createAccessUser({
  email,
  name: "Caro Vera",
  password: "demo-en-escena",
});
await db
  .update(user)
  .set({ emailVerified: true, role: "individual" })
  .where(eq(user.id, created.id));
const [account] = await db
  .insert(academies)
  .values({
    userId: created.id,
    name: "Caro Vera",
    contactName: "Caro Vera",
    phone: "3515551111",
    kind: "individual",
  })
  .returning();
await db.insert(individuals).values({
  academyId: account.id,
  firstName: "Caro",
  lastName: "Vera",
  documentType: "dni",
  documentNumber: "45123456",
  documentPhotoStorageKey: "prototype",
  linkConfirmedAt: new Date(),
  linkConfirmedDocumentNumber: "45123456",
});
console.log("ok", { rio: rio.id, email });
await client.end();
