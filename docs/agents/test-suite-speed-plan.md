# Plan: acelerar la suite de tests

Este plan captura la mejora futura para acelerar los tests de En Escena sin
bajar la confianza de validacion. Se basa en la investigacion hecha sobre
`mattpocock/course-video-manager`, que este repo ya toma como referencia de
workflows.

## Contexto actual

En Escena separa tests regulares y tests con Postgres local:

- `npm test`: corre Vitest excluyendo `*.db.test.ts`.
- `npm run test:db:file -- <archivo>`: empuja schema con Drizzle y corre un
  archivo DB enfocado.
- `npm run test:db`: empuja schema con Drizzle y corre todos los
  `*.db.test.ts` en serie.

La suite DB usa un Postgres local en `localhost:5433`, configurado por
`TEST_DATABASE_URL`. En sesiones Codex con sandbox administrado, ese acceso TCP
local requiere aprobacion elevada aunque no salga de la maquina. Por eso
`docs/agents/codex-workflows.md` documenta los prefijos persistentes:

- `npm run test:db:file`
- `npm run test:db`
- `docker compose up -d postgres`

Medicion local tomada durante esta investigacion:

- `npm run test:db:file -- tests/db/harness.db.test.ts`: 2.77s, verde.
- `npm run test:db`: 148.13s, con fallas existentes en el estado actual del
  repo. La corrida paso por 27 archivos, 25 verdes y 2 fallidos.

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
