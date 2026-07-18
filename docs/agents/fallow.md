# Fallow audit tools

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
