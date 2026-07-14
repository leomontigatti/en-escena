# Plan: migrar de npm a pnpm

Este plan describe una migracion controlada de En Escena desde `npm` a `pnpm`
como gestor de paquetes. No es prerequisito para acelerar la suite DB, pero
puede mejorar tiempos de instalacion, uso de disco y consistencia con
`mattpocock/course-video-manager`.

Estado actual: la migracion operativa usa `pnpm`. Mantener este documento como
registro de decisiones y checklist para revisar cambios futuros relacionados con
instalacion, lockfiles o automatizacion.

## Objetivo

Adoptar `pnpm` sin cambiar comportamiento de la app, tests ni scripts de
validacion.

La migracion debe preservar estas reglas del repo:

- Para TypeScript, seguir usando el script del proyecto: `pnpm run typecheck`.
  No usar `pnpm exec tsc` como validacion directa.
- Los tests DB deben seguir apuntando a `TEST_DATABASE_URL`, nunca a datos de
  produccion o preview.
- No mezclar esta migracion con refactors de codigo o cambios de dependencias no
  necesarios.

## Beneficios esperados

- Instalaciones mas rapidas por el store global de `pnpm`.
- Menor uso de disco en maquinas con varios proyectos Node.
- Lockfile reproducible con `pnpm-lock.yaml`.
- Resolucion de dependencias mas estricta, exponiendo usos accidentales de
  dependencias transitivas.
- Mejor alineacion operativa con `mattpocock/course-video-manager`, que usa
  `pnpm`.

## Riesgos

- La resolucion estricta puede romper imports que hoy funcionan por hoisting
  accidental.
- Algunas herramientas pueden asumir layout tipo `npm` en `node_modules`.
- CI, deploy o agentes pueden quedar desactualizados si vuelven a documentar o
  ejecutar comandos del gestor anterior.
- La migracion puede generar ruido grande en lockfile si se mezcla con cambios
  de dependencias.

## Fase 1: auditoria previa

1. Confirmar version de Node usada por el proyecto.
2. Confirmar si `corepack` esta disponible en los entornos de desarrollo y CI.
3. Revisar archivos que mencionan comandos del gestor anterior:
   - `AGENTS.md`
   - `docs/agents/workflows.md`
   - `docs/local-auth.md`
   - `package.json`
   - cualquier workflow de CI/deploy si se agrega en el futuro.
4. Identificar si existen scripts o herramientas que llaman al gestor anterior
   internamente.
5. Correr la validacion base actual antes de migrar:
   - `pnpm format:check`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm test:db` cuando la suite DB este verde en la rama base.

Resultado esperado: una linea base verde o una lista explicita de fallas
preexistentes.

## Fase 2: activar pnpm

1. Elegir una version fija de `pnpm`.
2. Agregar `packageManager` a `package.json`, por ejemplo:

   ```json
   {
     "packageManager": "pnpm@10.x.x"
   }
   ```

3. Habilitar `corepack` en documentacion local:

   ```bash
   corepack enable
   corepack prepare pnpm@10.x.x --activate
   ```

4. Generar `pnpm-lock.yaml`:

   ```bash
   pnpm install
   ```

5. Eliminar `package-lock.json` en el mismo cambio, si la migracion se acepta.

## Fase 3: adaptar scripts y docs

Actualizar comandos documentados:

- instalacion: `pnpm install`
- desarrollo: `pnpm dev`
- TypeScript: `pnpm typecheck`
- tests unitarios: `pnpm test`
- DB enfocada: `pnpm test:db:file <archivo>`
- DB final: `pnpm test:db`
- build: `pnpm build`

Mantener la advertencia de TypeScript:

- Correcto: `pnpm typecheck`
- Incorrecto: `pnpm exec tsc`

Actualizar `docs/agents/workflows.md` para que el orden de validacion use
`pnpm`.

Actualizar `docs/local-auth.md` para el flujo de instalacion local.

Si quedan referencias historicas a `npm` en ADRs, no editarlas salvo que sean
instrucciones operativas vigentes.

## Fase 4: validar compatibilidad

Despues de instalar con `pnpm`, correr:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Para DB, cuando el estado de la rama lo permita:

```bash
pnpm test:db:file tests/db/harness.db.test.ts
pnpm test:db
```

Si aparecen fallas de resolucion de modulos:

1. Identificar si el codigo importa una dependencia transitiva no declarada.
2. Agregar la dependencia directa al `package.json` solo si el proyecto la usa
   directamente.
3. Evitar `shamefully-hoist` salvo que una herramienta externa lo requiera y se
   documente el motivo.

## Fase 5: adaptar automatizacion

Cuando exista CI/deploy configurado, actualizarlo para:

1. Instalar pnpm con `corepack`.
2. Usar cache de pnpm store.
3. Instalar con:

   ```bash
   pnpm install --frozen-lockfile
   ```

4. Ejecutar los scripts equivalentes con `pnpm`.

Para agentes Codex, mantener aprobaciones persistentes documentadas para:

- `pnpm test:db:file`
- `pnpm test:db`
- `docker compose up -d postgres`

## Criterios de aceptacion

- `package-lock.json` fue reemplazado por `pnpm-lock.yaml`.
- `package.json` declara `packageManager`.
- La instalacion desde cero funciona con `pnpm install --frozen-lockfile`.
- `pnpm format:check`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.
- `pnpm test:db:file tests/db/harness.db.test.ts` pasa con Postgres local.
- `pnpm test:db` pasa o conserva solamente fallas preexistentes documentadas.
- Las docs operativas ya no instruyen usar `npm` para comandos activos del repo.

## Recomendacion

Hacer esta migracion en una rama dedicada, sin cambios funcionales. Primero
cerrar o documentar las fallas DB preexistentes para que la validacion final de
la migracion sea clara. Si el objetivo principal es acelerar tests, tratar esta
migracion como mejora complementaria: la palanca principal sigue siendo el plan
de `docs/agents/test-suite-speed-plan.md`.
