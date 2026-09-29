import { FieldLegend, FieldSet } from "@/components/ui/field";
import type { PortalChoreographyDetailChoreography } from "@/features/portal/choreographies/detail/music-editor.shared";

/**
 * The cast as the academy reads it: the dancers, each with the age the
 * choreography was placed with, then the professors. Read-only, since only the
 * administration changes the roster.
 */
export function PortalChoreographyPeopleLists({
  choreography,
}: {
  choreography: PortalChoreographyDetailChoreography;
}) {
  return (
    <>
      <PeopleList
        emptyMessage="Sin bailarines."
        label="Bailarines"
        people={choreography.dancers.map((dancer) => ({
          detail: `${dancer.ageAtEventStart} años`,
          id: dancer.id,
          name: `${dancer.firstName} ${dancer.lastName}`,
        }))}
      />
      <PeopleList
        emptyMessage="Sin profesores."
        label="Profesores"
        people={choreography.professors.map((professor) => ({
          id: professor.id,
          name: `${professor.firstName} ${professor.lastName}`,
        }))}
      />
    </>
  );
}

function PeopleList({
  emptyMessage,
  label,
  people,
}: {
  emptyMessage: string;
  label: string;
  people: Array<{ detail?: string; id: string; name: string }>;
}) {
  return (
    <FieldSet className="gap-2">
      <FieldLegend variant="label">{label}</FieldLegend>
      {people.length === 0 ? (
        <p className="rounded-lg border px-3 py-6 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <ul aria-label={label} className="divide-y rounded-lg border">
          {people.map((person) => (
            <li
              key={person.id}
              className="flex min-h-10 items-center justify-between gap-3 px-3 text-sm"
            >
              <span>{person.name}</span>
              {person.detail ? (
                <span className="text-muted-foreground">{person.detail}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </FieldSet>
  );
}
