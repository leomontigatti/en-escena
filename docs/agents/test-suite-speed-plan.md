# Plan: acelerar la suite de tests

Este plan captura la mejora futura para acelerar los tests de En Escena sin
bajar la confianza de validacion. Se basa en la investigacion hecha sobre
`mattpocock/course-video-manager`, que este repo ya toma como referencia de
workflows.

## Contexto actual

En Escena separa tests regulares y tests DB con dos rutas:

- `npm test`: corre Vitest excluyendo `*.db.test.ts`.
- `npm run test:db:file -- <archivo>`: usa el harness rapido con `PGlite` y un
  snapshot cacheado del schema para un archivo DB enfocado.
- `npm run test:db`: corre la suite DB completa sobre la ruta final confiable
  con Postgres real.
- `npm run test:db:final`: alias explicito de la misma corrida final confiable
  sobre Postgres real.
- `npm run test:db:fast:full`: conserva la suite DB completa sobre el harness
  rapido con `PGlite`, pero queda como ruta experimental para depurar el
  harness. No es el comando default de confianza.
- `npm run test:db:file:final -- <archivo>`: alias explicito de la corrida
  final enfocada sobre Postgres real.
- `npm run test:db:file:postgres -- <archivo>`: conserva la ruta enfocada sobre
  Postgres real para comparar o depurar el harness rapido.

La corrida final confiable usa un Postgres local en `localhost:5433`,
configurado por `TEST_DATABASE_URL`. En sesiones Codex con sandbox
administrado, ese acceso TCP local requiere aprobacion elevada aunque no salga
de la maquina. Por eso `docs/agents/codex-workflows.md` documenta los prefijos
persistentes:

- `npm run test:db:final`
- `npm run test:db`
- `npm run test:db:postgres`
- `npm run test:db:file:final`
- `npm run test:db:file:postgres`
- `docker compose up -d postgres`

## Implementacion issue #126

Medicion tomada el 2026-06-20 en `sandcastle/issue-126` sobre el harness DB
enfocado:

| Ruta                | Comando                                                        | Tiempo de pared | Desglose relevante                     |
| ------------------- | -------------------------------------------------------------- | --------------: | -------------------------------------- |
| Postgres preservado | `npm run test:db:file:postgres -- tests/db/harness.db.test.ts` |           3.95s | Vitest `Duration` 1.03s; `tests` 130ms |
| Fast path PGlite    | `npm run test:db:file -- tests/db/harness.db.test.ts`          |           3.18s | Vitest `Duration` 2.13s; `tests` 705ms |

Lectura operativa:

- La mejora medida del comando enfocado es `770ms` menos de pared para el test
  de harness en esta rama.
- `npm run test:db:file` queda como ruta enfocada rapida y
  `npm run test:db` queda como ruta final confiable.
- El snapshot del schema queda cacheado por hash de schema para repetir
  corridas enfocadas sin tocar `TEST_DATABASE_URL`.

## Enmienda operativa 2026-06-21

Despues de cerrar los issues de implementacion, se revalido el estado de las
suites:

- `npm test`: verde, 27 archivos y 127 tests, ~24s.
- `npm run test:db:final`: verde contra Postgres real, 28 archivos y 241
  tests, ~80s.
- `npm run test:db:file -- <archivo>`: verde para los archivos enfocados
  probados con `PGlite`.
- `npm run test:db:fast:full`: falla en modo paralelo default con el error
  `PGlite failed to initialize properly`; la misma suite pasa serializada con
  `--maxWorkers=1 --no-file-parallelism`, pero tarda ~99s.

Decision operativa: `PGlite` queda como ruta enfocada rapida para TDD y la
suite completa default vuelve a Postgres real. Investigar la concurrencia de
`PGlite` queda fuera de este ajuste.

## Linea base actual

Medicion repetible tomada el 2026-06-20 en `sandcastle/issue-122`.

Metodologia:

- Tiempo de pared: `time` del shell sobre el comando completo.
- Desglose interno: salida `Duration` de Vitest cuando aplica. Los campos como
  `collect` y `tests` son tiempos agregados de Vitest y pueden superar el
  tiempo de pared cuando hay trabajo en paralelo.
- Para los comandos `test:db:file` y `test:db`, el tiempo de pared incluye
  `npm run db:test:push`.

### Medidas

| Superficie              | Comando                                                                                   | Tiempo de pared | Desglose relevante                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------- | --------------: | ------------------------------------------------------------------------------------------ |
| Suite regular           | `npm test`                                                                                |          20.86s | 25 archivos / 120 tests verdes; Vitest `Duration` 19.43s; `collect` 60.85s; `tests` 44.33s |
| Push de schema DB       | `npm run db:test:push`                                                                    |           2.31s | Sin Vitest; costo fijo previo a cada corrida DB                                            |
| Harness DB enfocado     | `npm run test:db:file -- tests/db/harness.db.test.ts`                                     |           4.90s | 2 tests; Vitest `Duration` 1.29s; `collect` 670ms; `tests` 167ms                           |
| DB chico                | `npm run test:db:file -- app/lib/admin/users/internal-invitation-route.server.db.test.ts` |           5.45s | 1 test; Vitest `Duration` 2.02s; `collect` 1.21s; `tests` 257ms                            |
| DB mediano              | `npm run test:db:file -- app/lib/events/management.server.db.test.ts`                     |           5.64s | 14 tests; Vitest `Duration` 2.18s; `collect` 670ms; `tests` 952ms                          |
| DB grande / alto riesgo | `npm run test:db:file -- app/lib/admin/events/bases-route.server.db.test.ts`              |          19.39s | 22 tests; Vitest `Duration` 15.74s; `collect` 8.77s; `tests` 6.45s                         |
| Suite DB completa       | `npm run test:db`                                                                         |          80.32s | 27 archivos / 238 tests verdes; Vitest `Duration` 77.40s; `collect` 28.10s; `tests` 42.99s |

### Fallas preexistentes al momento de medir

No hubo fallas preexistentes en esta corrida base:

- `npm test`: 25 archivos verdes, 120 tests verdes.
- `npm run test:db`: 27 archivos verdes, 238 tests verdes.

Resultado de issue `#123`: se revalido la linea base DB el 2026-06-20 sobre
`sandcastle/issue-123`, despues de integrar `#122`, para identificar fallas
preexistentes antes de optimizar el harness:

- `npm run test:db:file -- tests/db/harness.db.test.ts`: 1 archivo verde, 2
  tests verdes.
- `npm run test:db`: 27 archivos verdes, 238 tests verdes.
- Archivos DB con falla preexistente: ninguno.
- Modos de falla DB a aislar de cambios de harness: ninguno.

Conclusion operativa: la linea base vigente para el trabajo de optimizacion no
tiene fallas DB preexistentes pendientes. Cualquier falla DB nueva sobre esta
base debe tratarse como regresion del cambio en curso, no como deuda anterior
del harness.

### Observaciones de la linea base

- El costo fijo de `db:test:push` ya consume ~2.31s antes de ejecutar Vitest.
- En archivos chicos o medianos, `collect` e importacion pesan mas que la
  ejecucion real de tests.
- En la suite DB completa, el tiempo dominante ya es la ejecucion de tests
  (`42.99s`), pero `collect` sigue siendo un costo material (`28.10s`).
- `app/lib/admin/events/bases-route.server.db.test.ts` queda confirmado como
  superficie grande y de alto riesgo para comparar mejoras futuras.

## Referencia externa

`mattpocock/course-video-manager` resolvio un problema similar en junio de 2026:

- Issue: <https://github.com/mattpocock/course-video-manager/issues/976>
- PR: <https://github.com/mattpocock/course-video-manager/pull/979>
- ADR en el repo de referencia:
  `docs/adr/0014-test-database-isolation.md`
- Archivos clave en el repo de referencia:
  - `vite.config.ts`
  - `app/test-utils/pglite.ts`
  - `app/test-utils/global-setup.ts`

Hallazgos relevantes:

- El repo de referencia no tiene `test:db` separado; usa un solo `pnpm test`
  con Vitest.
- Sus tests DB usan PGlite en proceso, no un Postgres real por puerto.
- Detectaron dos costos dominantes:
  - carga repetida de modulos con `isolate: true`;
  - creacion redundante del schema con `drizzle-kit pushSchema`.
- Implementaron dos mejoras:
  - dividir Vitest en proyecto compartido con `isolate: false` y proyecto
    aislado para archivos con `vi.mock` o `vi.stub*`;
  - crear un snapshot PGlite del schema una vez en `globalSetup` y cargarlo en
    cada archivo DB.
- Reportaron mejoras:
  - suite completa de 27.7s a 13.4s;
  - setup DB por archivo de 724ms a 263ms.
- Registraron una alternativa diferida: Postgres real en un puerto, con DB o
  schema por worker usando `VITEST_POOL_ID`. La descartaron por ahora porque
  PGlite daba suficiente velocidad sin Docker, puertos ni dependencia nativa.

## Objetivo

Reducir el tiempo de feedback de tests, especialmente DB, manteniendo estas
propiedades:

- tests DB aislados de datos productivos;
- tests que ejerciten el mismo tipo de interface que usa la app;
- posibilidad de corridas enfocadas rapidas durante TDD;
- una corrida final confiable para cambios de schema, repositorios,
  loaders/actions persistentes y reglas de negocio respaldadas por datos.

## Actualizacion de decision 2026-06-20

Issue `#125` cerro la decision pendiente del plan:

- Comparacion decidida:
  - `PGlite con schema snapshots`: gana como siguiente implementacion porque la
    linea base actual tiene un costo fijo medido de `db:test:push` (~2.31s por
    corrida), no hay fallas DB preexistentes, y el POC de `#124` ya cubrio con
    exito schema, FKs, constraints, transacciones, `jsonb` y queries raw
    relevantes.
  - `Postgres real por worker`: queda como fallback de mayor fidelidad, pero
    todavia exige template por worker, limpieza, `localhost:5433` y no tiene
    una mejora medida en este repo que justifique tomarlo primero.
- Decision: implementar primero un fast path con `PGlite` y snapshots de
  schema, manteniendo una corrida final confiable sobre Postgres real, ahora
  expuesta como `npm run test:db:final`, hasta probar la nueva ruta.
- ADR: ver `docs/adr/0007-db-test-isolation-model.md`.

## Actualizacion issue #128

Issue `#128` evaluo la siguiente optimizacion pendiente: dividir Vitest en un
proyecto compartido con `isolate: false` y un proyecto aislado para archivos
riesgosos, o desactivar aislamiento de modulo de forma mas amplia.

### Medicion aplicada

Prueba tomada el 2026-06-20 en `sandcastle/issue-128` sobre la suite regular
porque ahi vive la mayoria de los mocks y mutaciones globales que condicionan
la decision:

| Ruta experimental | Comando                                                                 | Tiempo de pared | Resultado |
| ----------------- | ----------------------------------------------------------------------- | --------------: | --------- |
| Baseline actual   | `vitest --run --exclude tests/db/db-test-workflow.test.ts`              |          13.45s | Verde     |
| Sin aislamiento   | `vitest --run --no-isolate --exclude tests/db/db-test-workflow.test.ts` |          14.97s | 2 fallas  |

Lectura operativa:

- `isolate: false` fue `1.52s` mas lento en esta repo para la suite regular
  medida, asi que no produjo una mejora material de tiempo.
- La corrida experimental tambien introdujo fallas reales antes de considerar
  DB tests o una mezcla de proyectos.

### Fallas observadas con `--no-isolate`

- `app/components/auth/access-ui.test.tsx` fallo con
  `(0 , jsxDEV) is not a function`, señal de contaminacion entre archivos a
  nivel de runtime o cache de modulos.
- `app/lib/shared/route-notification-toasts.test.ts` dejo de observar la llamada
  esperada a `toast.success`, señal de contaminacion entre mocks compartidos.

### Archivos identificados como aislados obligatorios antes de cualquier adopcion

DB tests con mocks o estado modular compartido:

- `app/lib/academies/registration.server.db.test.ts`
- `app/lib/auth/access-recovery.server.db.test.ts`

Suite regular con mocks, stubs, reseteo de modulos o mutacion de entorno:

- `app/lib/shared/email.server.test.ts`
- `app/lib/shared/route-notification-toasts.test.ts`
- `app/lib/auth/access-auth-provider.server.test.ts`
- `app/lib/auth/private-header.render.test.tsx`
- `app/lib/auth/access-ui.validation.test.ts`
- `app/lib/auth/access-recovery.server.test.ts`
- `app/lib/admin/dancers/inscriptions-section.render.test.tsx`
- `app/lib/portal/route.render.test.tsx`
- `app/lib/admin/events/events-route.render.test.tsx`
- `app/lib/admin/route.render.test.tsx`

Suite regular con mutaciones globales de `window`, `document` o runtime DOM:

- `app/components/admin/events/event-prices.test.tsx`
- `app/components/shared/data-table.test.tsx`
- `app/lib/portal/coreografia-dancer-editor.test.tsx`
- `app/lib/admin/dancers/dancer-detail-dialog.test.tsx`
- `app/lib/portal/bailarines-dialog.test.tsx`
- `app/lib/portal/coreografias-create-dialog.render.test.tsx`
- `app/components/auth/access-ui.test.tsx`

### Decision

No se adopta por ahora una division de proyectos Vitest ni un modo compartido
con `isolate: false`.

Motivo medido:

- Sin una mejora material de tiempo y con fallas inmediatas bajo
  `--no-isolate`, agregar un proyecto `shared` obligaria a mantener una lista
  amplia de excepciones sin justificar la complejidad extra.
- Los dos DB tests con `vi.mock` ya fuerzan a separar rutas seguras si algun
  dia se retoma esta idea.
- La suite regular tambien requiere una lista larga de archivos aislados, y el
  beneficio esperado quedo invalidado por la medicion actual.

Conclusion operativa: mantener la configuracion actual de un solo proyecto por
suite (`vitest.config.ts`, `vitest.db.fast.config.ts`, `vitest.db.config.ts`)
hasta que aparezca una mejora medible y una estrategia de aislamiento mas
acotada.

No se hicieron cambios de configuracion Vitest para esta decision. Por eso las
corridas repetidas con orden aleatorio quedan fuera de alcance en `#128`: son
criterio de aceptacion para una adopcion de proyecto compartido, no para una
decision documentada de no adoptar el cambio.

## Propuesta de implementacion

### Fase 1: medir antes de cambiar

Crear una linea base repetible:

1. Medir `npm test`.
2. Medir `npm run test:db:file -- tests/db/harness.db.test.ts`.
3. Medir 3 archivos DB representativos:
   - uno chico;
   - uno mediano;
   - uno grande, por ejemplo `app/lib/admin/events/bases-route.server.db.test.ts`
     o `app/lib/portal/choreographies.server.db.test.ts`.
4. Medir `npm run test:db` cuando la suite este verde.
5. Separar tiempos de:
   - `db:test:push`;
   - collect/import de Vitest;
   - ejecucion real de tests.

Resultado esperado: una tabla con tiempos antes de cualquier refactor.

Estado actual: completado. La tabla de linea base anterior es la referencia de
comparacion para los issues hijos de este plan.

### Fase 2: estudiar compatibilidad PGlite

Validar si En Escena puede usar PGlite para todos o algunos tests DB:

1. Instalar experimentalmente `@electric-sql/pglite` en una rama.
2. Crear un helper equivalente a `tests/db/harness.ts`, pero en proceso:
   - `createTestDb()`;
   - `truncateAllTables(testDb)`;
   - schema aplicado con `drizzle-kit/api`.
3. Migrar solamente `tests/db/harness.db.test.ts` o crear un test piloto nuevo.
4. Probar tipos y queries usadas por el schema actual:
   - enums;
   - foreign keys;
   - constraints;
   - `json/jsonb` si aplica;
   - transacciones;
   - SQL raw usado por repositorios.
5. Documentar incompatibilidades o diferencias contra Postgres real.

Criterio de avance: si PGlite cubre el comportamiento que la app necesita, se
puede seguir con snapshot. Si no, pasar a la alternativa Postgres real por
worker.

### Fase 3A: PGlite con snapshot de schema

Si PGlite es compatible:

1. Agregar `app/test-utils/global-setup.ts` o `tests/db/global-setup.ts` que:
   - cree una instancia PGlite;
   - aplique el schema con `pushSchema`;
   - exporte un snapshot con `dumpDataDir`;
   - escriba el snapshot en `tmpdir`;
   - lo provea a Vitest con `provide`.
2. Cambiar `createTestDb()` para:
   - cargar `loadDataDir` desde el snapshot inyectado;
   - mantener fallback a `pushSchema` cuando se corre un archivo sin
     `globalSetup`.
3. Mantener `truncateAllTables` en `beforeEach` para aislamiento por test.
4. Migrar archivos DB por grupos, priorizando los que no dependan de
   comportamiento exclusivo de Postgres real.
5. Mantener una corrida final contra Postgres real si encontramos diferencias
   de fidelidad relevantes.

Riesgos:

- PGlite puede no cubrir algun detalle que hoy Postgres real valida.
- El snapshot valida el schema generado por `pushSchema`, no una migracion
  manual divergente.

### Fase 3B: Postgres real por worker

Si PGlite no alcanza:

1. Mantener Postgres local como fuente de fidelidad.
2. Construir un template de test una vez por corrida:
   - crear DB o schema base;
   - aplicar Drizzle schema;
   - congelar como template.
3. Para cada worker de Vitest, crear una DB o schema aislado usando
   `VITEST_POOL_ID`.
4. Configurar `TEST_DATABASE_URL` por worker antes de importar `@/db`.
5. Remover la ejecucion serial solo despues de probar aislamiento real.

Preferencia tecnica: DB/schema por worker antes que prefijos de tabla dinamicos.
La referencia de `course-video-manager` rechazo prefijos dinamicos porque
`pgTableCreator` fija el prefijo al importar el schema.

Riesgos:

- Mas complejidad operacional.
- Sigue requiriendo aprobacion sandbox para `localhost:5433`.
- Necesita limpieza robusta de DBs/schemas temporales.

### Fase 4: dividir proyectos Vitest

Independientemente de PGlite o Postgres real, evaluar una division de proyectos
Vitest como en `course-video-manager`:

1. Proyecto `shared`:
   - `isolate: false`;
   - la mayoria de tests sin mocks globales;
   - DB tests si son estables sin aislamiento de modulo.
2. Proyecto `isolated`:
   - archivos que usan `vi.mock`, `vi.stubGlobal`, `vi.stubEnv` o mutan estado
     global/modular compartido;
   - mantiene `isolate: true`.
3. Agregar una lista explicita de archivos aislados en config.
4. Verificar con orden aleatorio:
   - `vitest run --sequence.shuffle`;
   - repetir al menos 3 veces antes de aceptar el cambio.

Riesgos:

- `isolate: false` puede introducir flakes por estado global compartido.
- Los archivos con mocks/stubs deben moverse al proyecto aislado apenas se
  detecten.

### Fase 5: actualizar workflows y comandos

Cuando la estrategia este probada:

1. Actualizar `package.json`:
   - mantener comandos enfocados;
   - agregar comandos rapidos si corresponde, por ejemplo `test:db:fast`;
   - mantener un comando final confiable.
2. Actualizar `docs/agents/codex-workflows.md`:
   - que comando usar durante TDD;
   - que comando usar antes de cerrar;
   - que aprobaciones sandbox siguen siendo necesarias.
3. Si se adopta PGlite, actualizar `docs/local-auth.md` para aclarar que tests
   DB ya no dependen necesariamente del Postgres local en todos los modos.
4. Registrar la decision como ADR si cambia el modelo de aislamiento DB.

## Criterios de aceptacion

- La suite regular y la suite DB estan verdes antes y despues del cambio.
- Las corridas enfocadas siguen funcionando con una sola ruta de archivo.
- La suite DB completa mejora al menos 30% en tiempo de pared, o se documenta
  por que la mejora no compensa el riesgo.
- Si se usa `isolate: false`, la suite pasa 3 veces con `--sequence.shuffle`.
- El workflow final conserva una corrida con fidelidad suficiente para reglas
  de Evento, Academia, Coreografia, Bases del evento, Usuario y Sesion de
  acceso.

## Recomendacion inicial

Empezar por una prueba de concepto de PGlite con snapshot en 1 o 2 archivos DB
chicos. Si aparece una incompatibilidad de fidelidad con Postgres, cambiar el
foco a Postgres real por worker. No conviene empezar directamente por
paralelizar la suite actual: hoy el harness serial y el Postgres compartido son
parte del aislamiento.
