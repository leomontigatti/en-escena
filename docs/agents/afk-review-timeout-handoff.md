# Handoff — timeout de `agent:review` en el PR #512

Estado: **abierto para discusión.** Nada de lo que sigue está implementado; el
único cambio ya hecho a raíz de este análisis es el cleanup del PR #512, que es
independiente de estas recomendaciones.

Fecha del incidente: 2026-07-27. Corrida:
[30310966191](https://github.com/leomontigatti/en-escena/actions/runs/30310966191).

## Qué pasó

El paso `Run review runner` del workflow `AFK Review` chocó contra su guardrail
`timeout-minutes: 30` (`.github/workflows/agent-review.yml:86`). Arrancó
22:30:50 UTC y GitHub lo mató 23:01:02 UTC.

Consecuencias: los pasos `Post review`, `Mark PR ready` y `Race-safe push`
quedaron en `skipped`, el PR #512 se etiquetó `agent:blocked`, y el comentario
automático informó **"no reason file written — check workflow logs"**. Es decir:
el trabajo del agente se perdió entero y no quedó ningún rastro accionable en el
PR.

### La causa: el presupuesto se fue en correr la suite, no en revisar

La revisión en sí estaba prácticamente terminada a los 4 minutos. El agente
había leído el diff, consultado el issue #501, corrido `pnpm typecheck`,
reproducido el bug del prefijo `__Secure-` con un `node -e`, y hecho sus propias
ediciones de cleanup. Lo que lo mató fue el wall-clock de los tests:

| Hora        | Qué                                                              |
| ----------- | ---------------------------------------------------------------- |
| 22:32       | Lanza `pnpm test` completo con `BETTER_AUTH_URL=https://…`       |
| 22:35→22:45 | Bloquea ~10 min esperándolo (~13 min de corrida total)           |
| 22:45       | Hace ediciones, lanza un **segundo** `pnpm test` completo        |
| 22:51       | Lo da por colgado, lo mata con `pkill` — tira ~6 min de progreso |
| 22:51       | Reinicia sólo `pnpm test:db` desde cero                          |
| 22:53       | Mata un vitest huérfano en paralelo que competía por CPU         |
| 22:54       | Suite a mitad de camino, todo verde; le faltaban ~10 min         |
| 23:01       | Timeout del paso                                                 |

Entre las 22:34 y las 23:01 el agente no produjo **ninguna** sustancia de
review: fue un loop de espera puro (`sleep 500; tail …`, repetido ~30 veces).

El problema estructural: `pnpm test` es `test:unit && test:db` — **serial**, en
un runner de 2 cores. CI nunca hace eso: separa `checks` (unit) y `db-gate`
(Postgres real) en dos runners paralelos, y ambos terminaron en ~4-5 min para
esta misma rama. El prompt del review (`.sandcastle/agent-review/prompt.md:59-61`)
le pide al agente correr `pnpm test` **dos veces**, antes y después de sus
ediciones. Dos suites completas seriales ≈ 26 min de los 30 disponibles, sin
contar el trabajo de review.

Dos agravantes de este PR en particular: el diff toca el manejo de cookies y env
de auth, así que el agente razonablemente re-corrió la suite de DB con env https
(una tercera corrida); y la decisión de `pkill` + reinicio tiró una corrida que
probablemente estaba por terminar.

### Calibración: es la primera vez

Revisé las últimas 20 corridas de `AFK Review`. Los tres fallos previos **no**
fueron timeouts (murieron en 2s y en 4min por otras causas). Esto es una primera
ocurrencia, disparada por un PR que resultó ser pesado en infraestructura de
tests. Eso favorece arreglos baratos y en contra de una re-arquitectura.

## Recomendaciones a discutir

### 1. Que los agentes dejen de correr la suite completa

Es el arreglo de fondo. El agente está duplicando lo que CI ya hace, serialmente
y dos veces, dentro de un presupuesto de 30 minutos.

Cambiar los prompts que hoy dicen "run `pnpm typecheck` and `pnpm test`" para
que corran `pnpm typecheck` más `pnpm test:db <path>` **dirigido** a los
archivos tocados, y dejen la suite completa a CI. Archivos afectados:

- `.sandcastle/agent-review/prompt.md:59-61`
- `.sandcastle/agent-implement/prompt.md:41`
- `.sandcastle/agent-implement-pr/prompt.md:50`
- `.sandcastle/agent-implement-prd/prompt.md:49`

Evidencia a favor: para el cleanup del #512, `typecheck` + los tests de DB
dirigidos + la suite de auth + unit corrieron en **~2 minutos en total**
(25 + 57 + 578 tests, todos verdes) contra los ~13 minutos de `pnpm test`
completo. Ahorra wall-clock y gasto de tokens en cada corrida AFK, no sólo en
esta.

### 2. Decirle al agente cuál es su presupuesto

El prompt nunca menciona que existe un límite de wall-clock. Agregar algo como:
"Tenés ~30 min. La suite completa tarda ~13 min — no la corras dos veces. Nunca
mates una suite que sigue imprimiendo progreso para reiniciarla." Ese último
punto solo costó ~6 minutos acá.

### 3. Fallar en blando

Lo peor no es el timeout, es lo que quedó después: `agent:blocked` más
_"no reason file written — check workflow logs"_. Hubo que abrir Actions y leer
~400 líneas de log para entender algo.

Darle al runner un deadline interno por debajo del del paso (p.ej. 25 vs 30) para
que aborte su propio trabajo, escriba hallazgos parciales y una razón real, y
salga limpio. Como mínimo, que el paso `On failure` vuelque las últimas ~30
líneas del log del agente en el comentario del PR.

### 4. (Sólo después de 1-3) subir el techo

30 → 45 min para los runners de review/implement. Por sí solo es un parche que
sólo encarece los fallos, pero es un seguro razonable una vez que estén 1-3.
`architecture-review.yml` está en 20 min y es el siguiente más expuesto.

## Apéndice — timeouts actuales

```
agent-review.yml:86            30
agent-implement.yml:151        30
agent-implement-pr.yml:133     30
agent-implement-prd.yml:190    30
agent-update-branch.yml:86     30
agent-to-issues-prd.yml:118    30
architecture-review.yml:56     20
agent-promote-queued.yml:25     5
```
