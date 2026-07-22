# Assets AFK vendorizados de Matt Pocock

La plataforma AFK ("GitHub-Native Agent Platform") usa como **fuente de verdad** un conjunto
de assets del repo público [`mattpocock/course-video-manager`](https://github.com/mattpocock/course-video-manager).
Este repo los **vendoriza** (copia local, adaptada) para poder implementar los 8 workflows y
runners sin depender de leer el repo original. Contexto: mapa
[Mapa: plataforma AFK en GitHub Actions](https://github.com/leomontigatti/en-escena/issues/319),
ticket [Vendorizar el spec AFK + prompts + skill do-work](https://github.com/leomontigatti/en-escena/issues/341).

## Qué se trajo

| Asset                                              | Local                                                                                                                    | Fuente                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Spec de los 8 workflows                            | [`afk-agent-platform-spec.md`](./afk-agent-platform-spec.md)                                                             | `docs/agents/afk-agent-platform-spec.md`                     |
| Prompts base de los runners (9)                    | [`prompts/`](./prompts/)                                                                                                 | `docs/agents/prompts/*.prompt.md`                            |
| Skill `do-work` (SKILL + DB-TDD + FRONTEND-TDD)    | [`.claude/skills/do-work/`](../../.claude/skills/do-work/)                                                               | `.claude/skills/do-work/{SKILL,DB-TDD,FRONTEND-TDD}.md`      |
| Skills `to-prd` / `to-issues` (autoría HITL local) | [`.claude/skills/to-prd/`](../../.claude/skills/to-prd/), [`.claude/skills/to-issues/`](../../.claude/skills/to-issues/) | `.claude/skills/{to-prd-project,to-issues-project}/SKILL.md` |

## Qué se adaptó vs. la fuente

El grueso del spec es **runner-neutral por diseño** y se copió fiel. Los cambios son solo de
referencias concretas al repo:

- **Rama base `master`** en vez de `main` (nuestro default): nombres de rama, `git diff`,
  `--base`, checkouts, ejemplos.
- **Comandos de validación `pnpm typecheck` / `pnpm test`** donde la fuente decía genéricamente
  "the project's typecheck/tests" (ver [`workflows.md`](./workflows.md); `pnpm test` = unit +
  DB-PGlite, `pnpm typecheck` corre typegen + `tsc --noEmit`).
- **Docs de contexto** concretos: `CONTEXT.md`, `docs/adr/` (ADRs vinculantes) y
  [`domain.md`](./domain.md), en vez del `CONTEXT.md`/ADRs genérico de la fuente.
- **Coding standards** apuntando a `.sandcastle/CODING_STANDARDS.md` (canónico) y
  [`style-guide.md`](./style-guide.md) para frontend/UI.
- **Tracker `gh`** (GitHub Issues): los prompts usan `gh issue view … --comments` en vez de los
  placeholders "project-specific" de la fuente.
- **Apéndice C** del spec: `backlog.md` → [`issue-tracker.md`](./issue-tracker.md) (nuestro
  equivalente); `queued-promotion.md` **no existe** acá (su comportamiento vive entero en §4.7
  del spec); se agrega el link a `domain.md`/`CONTEXT.md`/`docs/adr/`.
- **`FRONTEND-TDD.md`**: la fuente manda usar `useEffectReducer` de `use-effect-reducer`; este
  repo **no** usa esa librería (ni reducers hoy), así que la sección "Reducer choice" quedó
  neutral respecto de la librería, preservando el principio (lógica de estado en un módulo puro
  y testeable).
- **`to-prd` / `to-issues`**: son las variantes AFK-native de las globales HITL `to-spec` /
  `to-tickets`. La base es `to-prd-project` / `to-issues-project` de la fuente (modelo
  PRD-padre + sub-issues nativas ordenadas + `agent:implement`), y se les foldeó el contenido
  **más reciente** de las globales `to-spec`/`to-tickets`: framing de _seams_ para testear
  (`to-spec`), guía de _wide refactor / expand→migrate→contract_ (`to-tickets`, reexpresada
  para el orden de ejecución en lugar de blocking-edges), y `disable-model-invocation: true`.
  Se descartó de `to-tickets` el modelo de **blocking-edges/frontera** porque
  `agent-implement-prd.yml` lee **orden de lista**, no dependencias explícitas. Publican con
  `gh issue create --parent` (convención de [`issue-tracker.md`](./issue-tracker.md)) en vez
  del baile manual de la API `sub_issues`, y no aplican ningún label `agent:*` (el despacho es
  humano, ver [`afk-setup.md`](./afk-setup.md)). Producen la **misma forma de sub-issue** que
  el runner desatendido [`prompts/to-issues.prompt.md`](./prompts/to-issues.prompt.md).

## Qué **no** se adaptó (a propósito)

- El **Apéndice A** ("Reference implementation notes — Sandcastle / Claude Code") describe el
  stack de referencia del repo original; se mantiene tal cual como documentación de esa
  realización concreta. La reconciliación runner ↔ orquestador ya se completó en los
  tickets-fase del mapa #319 (#344 el modelo orquestador↔runner, #347 el cutover): el runner
  local Docker (`main.mts` + `*-prompt.md`) fue retirado y `.sandcastle/` hoy contiene solo los
  runners AFK (`agent-*/`), sus helpers (`lib/`, `run-with-retry.mts`, `retry-feedback.mts`) y
  `CODING_STANDARDS.md`.
- Los **prompts siguen siendo skeletons runner-neutrales**: la mitad "cómo se invoca al runner"
  se concreta al cablear cada workflow.
