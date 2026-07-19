# AFK — setup operativo (labels, secrets, degradación)

Runbook de la infraestructura que consumen **todos** los workflows AFK (Parte 3 del
[spec](./afk-agent-platform-spec.md)). El spec §3.1 es la **fuente de verdad** de _qué_ hace
falta; este doc es el _cómo_ de este repo y el registro de lo ya provisionado. Issue de
origen: [#343](https://github.com/leomontigatti/en-escena/issues/343).

> **Estado:** labels **creados** (2026-07-18). Secrets **documentados** acá; su **carga** es
> una acción humana (ver checklist) porque los valores son credenciales que este runbook no
> puede generar. El **test empírico de degradación sin PAT** se corre con el primer workflow
> de cadena (#344+), no antes: hasta que exista un workflow que agregue un label-trigger, no
> hay nada que degradar. Ver [Degradación sin PAT](#degradación-sin-pat).

## Labels `agent:*` + `source:*`

El state machine (§3.2) asume que estos 8 labels existen. **Ya fueron creados** con los
comandos de abajo (idempotente-ish: `gh label create` falla si ya existe, sin efecto).
Significado canónico de cada uno: spec §3.1 → «Labels (pre-create all of these)».

```bash
gh label create "agent:to-issues"    --color 1d76db --description "AFK: PRD listo para descomponerse en sub-issues"
gh label create "agent:implement"    --color 0e8a16 --description "AFK: listo para una corrida de implement"
gh label create "agent:queued"       --color fbca04 --description "AFK: listo pero esperando blockers declarados; auto-promueve. Solo humano."
gh label create "agent:in-progress"  --color 0052cc --description "AFK: corrida activa (actúa como lock)"
gh label create "agent:review"       --color 5319e7 --description "AFK: PR listo para el workflow de review automatico"
gh label create "agent:blocked"      --color b60205 --description "AFK: corrida fallo o fue rechazada; necesita atencion humana antes de reintentar"
gh label create "agent:update-branch" --color d93f0b --description "AFK: el PR debe mergearse hacia arriba con su base"
gh label create "source:architecture-review" --color 5a5a5a --description "Procedencia: PRD propuesto por el workflow Architecture Review"
```

Verificar: `gh label list --limit 100 | grep -E 'agent:|source:architecture'`.

> `source:architecture-review` el spec dice que el propio workflow Architecture Review lo crea
> on-demand si falta; lo pre-creamos igual para que la procedencia sea consistente desde el día
> cero.

## Secrets

Tres credenciales; matriz completa (qué es / por qué) en spec §3.1 → «Secrets». Resumen
operativo de este repo:

| Secret                    | Cómo se obtiene                                                                                                                                                         | Cómo se carga                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `GITHUB_TOKEN`            | **Built-in.** GitHub Actions lo inyecta por-run. Nada que hacer.                                                                                                        | —                                       |
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude setup-token` (Claude Code CLI, cuenta con plan que habilite uso en CI). Genera un token OAuth de larga duración.                                                | `gh secret set CLAUDE_CODE_OAUTH_TOKEN` |
| `AGENT_PAT`               | PAT **classic** con scopes `repo` + `workflow`; o fine-grained con Contents / Issues / Pull requests = Read+Write y Workflows = Read+Write. De un humano o bot account. | `gh secret set AGENT_PAT`               |

### Por qué `AGENT_PAT` (fuertemente recomendado)

Sin él la plataforma **funciona pero se degrada** (ver abajo). Hace falta por dos razones
(spec §3.1/§3.4):

1. **Encadenamiento.** GitHub **suprime** los triggers de workflow para eventos causados por
   `GITHUB_TOKEN` (anti-loop). Un `--add-label agent:implement` hecho con `GITHUB_TOKEN` deja
   el label pero **no dispara** el workflow Implement. El PAT sí lo dispara.
2. **Push a `.github/workflows/`.** Empujar cambios a archivos de workflow requiere el scope
   `workflow`, que `GITHUB_TOKEN` no tiene.

### Checklist de carga (acción humana)

Este runbook no puede generar credenciales, pero sí guiar su carga. El helper
[`scripts/setup-github-secrets.sh`](../../scripts/setup-github-secrets.sh) es idempotente
(pregunta antes de sobreescribir), toma el input oculto y verifica al final:

```bash
# 1. Generar el token del runner (imprime un token OAuth de larga duración)
claude setup-token

# 2. Correr el helper: pide CLAUDE_CODE_OAUTH_TOKEN y AGENT_PAT, los carga y verifica
bash scripts/setup-github-secrets.sh
```

El PAT de orquestación se genera aparte, en https://github.com/settings/tokens (classic:
scopes `repo` + `workflow`), antes de correr el helper. A mano, sin el script, es lo mismo
que hace por dentro: `gh secret set CLAUDE_CODE_OAUTH_TOKEN`, `gh secret set AGENT_PAT`,
`gh secret list`.

> **Divergencia con el script de Matt Pocock** (`course-video-manager`, de donde se
> vendorizó el spec): el suyo carga `CLAUDE_CODE_OAUTH_TOKEN` + `GH_READ_TOKEN` — un PAT
> read-only para que el _agente_ lea issues _dentro_ del runner. Nuestro modelo
> orquestador↔runner (§3.9) no le da token de GitHub al runner: el orquestador prefetcha el
> contexto. Por eso el segundo secret es `AGENT_PAT` (`repo` + `workflow`), con otro
> propósito. Se adaptó la ergonomía, no el modelo de secrets.

Si `AGENT_PAT` se omite: la plataforma sigue, degradada. Ver la sección siguiente.

## Matriz de permisos por workflow

**Registrada en el spec §3.1** → «Per-workflow permissions matrix» (8 filas, columnas
`contents` / `issues` / `pull-requests`). No se duplica acá: cada workflow (#344+) declara sus
`permissions:` mínimos según esa tabla al implementarse.

## Degradación sin PAT

**Contrato** (spec §3.4): con PAT ausente o fallando, todo salto de cadena que _debería_
disparar el siguiente workflow **aterriza el label igual** — el _estado_ queda correcto — pero
el downstream **no arranca solo**. Un humano re-agregando el mismo label (acción externa a
`GITHUB_TOKEN`) reanuda la cadena. El patrón canónico bash (intentar con `AGENT_PAT`, si no
hay o falla caer a `GITHUB_TOKEN`) está en §3.4 y **debe** implementarse en cada punto donde un
workflow agrega un label para disparar otro.

### Cómo se prueba (con el primer workflow de cadena, #344+)

Hoy no hay workflow de cadena todavía, así que no hay degradación que ejercitar. Cuando exista
el primero (p. ej. To Issues → Implement), la verificación es:

1. Con el repo **sin** `AGENT_PAT` cargado, disparar el paso que agrega el label-trigger.
2. Confirmar que el label **aparece** en el issue/PR (estado correcto).
3. Confirmar que el workflow downstream **no** corrió (`gh run list` sin corrida nueva).
4. Re-agregar el label a mano y confirmar que ahora **sí** dispara.

El hecho de plataforma que sostiene todo esto — «label adds vía `GITHUB_TOKEN` no disparan
workflows» — es comportamiento documentado de GitHub Actions, no algo a demostrar por-repo; el
test de arriba valida que _nuestra_ implementación respeta el contrato.
