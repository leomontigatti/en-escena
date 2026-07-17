# En Escena — guía para Claude Code

## Comandos y validación

Regla importante: **no** usar `pnpm exec tsc` para validar en este repo. Usar
`pnpm typecheck` para que se generen los tipos de rutas de React Router antes de
que corra TypeScript. No correr `pnpm typecheck` en paralelo con `pnpm build`;
correrlos secuencialmente porque el build regenera `build/`.

Workflows del proyecto: ver [docs/agents/workflows.md](docs/agents/workflows.md).

## Investigar antes de implementar

Cuando el usuario pida investigar, revisar, diagnosticar, auditar, analizar o
explicar algo, no implementar cambios automáticamente. Devolver hallazgos,
contexto relevante, opciones o tradeoffs y un próximo paso recomendado, y
esperar a que el usuario pida explícitamente la implementación antes de editar
archivos.

Empezar a implementar de inmediato solo cuando el usuario pida claramente
implementar, arreglar, aplicar cambios o hacer el cambio.

## Coding standards

Todos los cambios de código deben seguir
[docs/agents/coding-standards.md](docs/agents/coding-standards.md). Tratarlo
como guía de todo el repo, no solo de Sandcastle.

## Style guide

Los cambios de frontend y UI deben seguir
[docs/agents/style-guide.md](docs/agents/style-guide.md), incluyendo los tokens
de color de En Escena, spacing, tipografía, convenciones de shadcn/ui y el tono
en español de la UI.

## Verificación de UI

La verificación de UI/UX se hace localmente manejando un navegador real con
`playwright-cli` (instalado globalmente; usar la skill `playwright-cli`). No usar
el navegador embebido de la app de escritorio: no existe en la CLI de terminal.
Es un flujo local; los agentes de Sandcastle no tienen browser y saltean esta
verificación. Ver la sección "UI Verification" en
[docs/agents/workflows.md](docs/agents/workflows.md).

## Issue tracker

Los issues se trackean en GitHub Issues para `leomontigatti/en-escena` con el
CLI `gh`. Ver [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
Usar `gh` directamente para operaciones de GitHub en este repo, incluyendo
crear, leer, editar, etiquetar y comentar issues, e inspeccionar PRs/checks. No
usar el connector/MCP de GitHub para este repo; puede tener permisos más
acotados que el auth local de `gh` y fallar con errores de acceso engañosos.

## Triage labels

Los triage labels usan el vocabulario por defecto de mattpocock/skills. Ver
[docs/agents/triage-labels.md](docs/agents/triage-labels.md).

## Domain docs

Este repo usa un layout de documentación de dominio de contexto único. Ver
[docs/agents/domain.md](docs/agents/domain.md).

## Operación local y auth

La operación local de base de datos, Supabase Auth y email-log está documentada
en [docs/local-auth.md](docs/local-auth.md).

---

## Fallow audit tools

Usar Fallow como herramienta de auditoría e investigación, no como gate
obligatorio de commit o push local. Correr `pnpm exec fallow audit --format json
--quiet --explain --gate-marker agent` cuando se audite explícitamente un
changeset, se prepare un handoff de PR o se investiguen hallazgos de
mantenibilidad.

El audit por defecto usa `gate=new-only`: solo los hallazgos introducidos por el
changeset actual afectan el veredicto. Los hallazgos heredados en archivos
tocados se reportan bajo `attribution` y se anotan con `introduced: false`.
Tratar errores JSON de runtime como `{ "error": true, ... }` como no
bloqueantes.

## Fallow task map

| Cuando el agente esté por...         | Correr                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| borrar un export o archivo "sin uso" | `pnpm exec fallow dead-code --trace <file>:<export>`                                 |
| borrar una dependencia "sin uso"     | `pnpm exec fallow dead-code --trace-dependency <name>`                               |
| auditar un changeset o handoff de PR | `pnpm exec fallow audit --base <ref>`                                                |
| priorizar refactoring                | `pnpm exec fallow health --hotspots --targets`                                       |
| preguntar quién es dueño del código  | `pnpm exec fallow health --ownership`                                                |
| chequear código sin tests alcanzable | `pnpm exec fallow health --coverage-gaps`                                            |
| consolidar duplicación               | `pnpm exec fallow dupes --trace dup:<fingerprint>`                                   |
| encontrar feature flags              | `pnpm exec fallow flags`                                                             |
| exponer candidatos de seguridad      | `pnpm exec fallow security`                                                          |
| entender un hallazgo                 | `pnpm exec fallow explain <issue-type>`                                              |
| scopear un monorepo                  | `--workspace <glob> / --changed-workspaces <ref>` (flags globales, prefijar comando) |
