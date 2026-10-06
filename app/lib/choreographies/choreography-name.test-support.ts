/**
 * What every path that writes a choreography's name must make of the same
 * typing (#764): the portal registration and the administrative save each run
 * this table, so a path that stops going through `validateChoreographyName`
 * stores or refuses something the other does not.
 */
export const choreographyNameWriteCases: ReadonlyArray<
  { typed: string } & ({ stored: string } | { refusal: string })
> = [
  { typed: "   Los   Cascanueces  ", stored: "Los Cascanueces" },
  { typed: "los cascanueces", stored: "Los Cascanueces" },
  { typed: "DANZA DE LA LUNA-LLENA", stored: "Danza de la Luna-Llena" },
  { typed: "   ", refusal: "Este campo es obligatorio." },
  { typed: "!!!", refusal: "Ingresá un nombre válido para la coreografía." },
  {
    typed: "a".repeat(121),
    refusal: "El nombre de la coreografía no puede superar los 120 caracteres.",
  },
];
