# PGlite POC para tests DB

Este piloto prueba `PGlite` contra el schema actual de En Escena usando el
mismo source de schema que hoy usan los tests DB (`app/db/schema.ts`).

## Alcance del piloto

- Archivo piloto: `tests/db/pglite.db.test.ts`
- Helper in-process: `tests/db/pglite.ts`
- Bootstrap del schema: `tests/db/migrate-pglite-schema.ts` (aplica
  `app/db/migrations` vía `migrate`; `tests/db/push-pglite-schema.ts` sobrevive
  como oráculo de `pushSchema` para el test de equivalencia)
- Workflow Postgres preservado: `pnpm test:db` y
  `pnpm test:db:file:postgres <archivo>`

El piloto valida estas capacidades contra una base in-process y aislada en un
directorio temporal:

- reset tipo harness con `truncate ... restart identity cascade`
- enums
- foreign keys
- constraints parciales/unique
- transacciones con rollback
- defaults `jsonb`
- patrones SQL que ya usa el repo (`ilike`, `lower`, `coalesce`)

## Resultado

No se encontraron incompatibilidades funcionales en el piloto para las
capacidades listadas arriba. El schema aplica y los queries ejercitados se
comportan como espera la app.

## Incompatibilidades y diferencias encontradas

1. `drizzle-kit/api` no carga de forma estable dentro del pipeline de
   transformacion de Vitest para este repo.
   Impacto: `pushSchema` se ejecuta desde un script Node separado
   (`tests/db/push-pglite-schema.ts`, hoy solo el oráculo de equivalencia) en
   lugar de importarlo directamente desde el test o un `globalSetup` Vitest sin
   ajustes extra.

2. Los errores del driver PGlite no tienen la misma forma que los errores del
   harness actual con `postgres`.
   Impacto: los metadatos de constraint quedan en `error.cause.code` y
   `error.cause.constraint`, no en propiedades top-level como
   `constraint_name`. Cualquier logica de app o tests que dependa de la forma
   exacta del error Postgres.js necesita una capa de adaptacion antes de usar
   PGlite como reemplazo directo.

## Lectura operativa

- Como POC, PGlite es suficientemente fiel para seguir evaluando un harness mas
  rapido con schema in-process.
- En el workflow actual, PGlite es la ruta default de la suite DB completa con
  `pnpm test:db` (parte de `pnpm test`), y para corridas enfocadas con
  `pnpm test:db <archivo>`. Postgres real queda como ruta de alta fidelidad en
  `pnpm test:db:postgres`, reservada al gate de CI (#305).
- Todavia no es un reemplazo transparente del stack actual porque faltaria
  resolver el bootstrap del schema, la compatibilidad de shape de errores y la
  estabilidad de inicializacion en modo paralelo.
