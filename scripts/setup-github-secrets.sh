#!/bin/bash
set -eo pipefail

# ============================================================
# AFK — carga de secrets de GitHub Actions
# ============================================================
#
# Carga los dos secrets que consumen los workflows AFK (spec §3.1).
# Idempotente: si un secret ya existe, pregunta antes de sobreescribir.
# El runbook completo (qué es cada secret, por qué, degradación sin
# PAT) vive en docs/agents/afk-setup.md.
#
# Nuestro modelo es orquestador↔runner (spec §3.9): el runner NO tiene
# token de GitHub. Por eso NO hay un PAT read-only para leer issues
# adentro del runner (el orquestador prefetcha y pasa el contexto por
# env/archivos). Los dos secrets son:
#
# 1. CLAUDE_CODE_OAUTH_TOKEN
#    Token OAuth de Claude Code; con él el runner autentica contra la
#    API de Anthropic. Obtenelo con:  claude setup-token
#
# 2. AGENT_PAT
#    PAT (classic) con scopes `repo` + `workflow`. El ORQUESTADOR lo usa
#    para (a) encadenar workflows agregando labels-trigger — GITHUB_TOKEN
#    no dispara downstream por el anti-loop de GitHub — y (b) pushear
#    cambios a .github/workflows/** (requiere el scope `workflow`).
#    Crealo en https://github.com/settings/tokens (classic: repo + workflow).
#    Es fuertemente recomendado: sin él la plataforma funciona pero se
#    degrada (los labels aterrizan, el downstream no arranca solo).
#
# Nota: GITHUB_TOKEN es built-in (GitHub lo inyecta por-run); no se carga.
#
# ============================================================

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: no encontré el comando 'gh'. Instalá GitHub CLI: https://cli.github.com"
  exit 1
fi

# `gh repo view` falla por dos motivos distintos: no hay remote de GitHub, o
# las credenciales no sirven. Descartar stderr los vuelve indistinguibles y un
# 401 termina reportado como "no pude determinar el repo", que manda a revisar
# el remote equivocado. Conservamos la salida para separar los casos.
if ! REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>&1); then
  if printf '%s' "$REPO" | grep -qiE 'bad credentials|HTTP 401|401 Unauthorized'; then
    echo "Error: gh no pudo autenticar contra GitHub."
    echo "  $REPO"
    echo ""
    if [ -n "${GH_TOKEN:-}" ]; then
      echo "GH_TOKEN está seteado y tiene prioridad sobre el login guardado de gh."
      echo "Si venció o fue revocado, corré:  unset GH_TOKEN && pnpm setup:secrets"
    else
      echo "Autenticá con:  gh auth login"
    fi
  else
    echo "Error: no pude determinar el repo. Corré esto dentro de un repo git con remote de GitHub."
    echo "  $REPO"
  fi
  exit 1
fi

if [ -z "$REPO" ]; then
  echo "Error: no pude determinar el repo. Corré esto dentro de un repo git con remote de GitHub."
  exit 1
fi

echo "Cargando secrets para: $REPO"
echo ""

# set_secret <NOMBRE> <línea-de-ayuda>
set_secret() {
  local name="$1"
  local hint="$2"

  echo "Secret: $name"
  echo "  $hint"
  echo ""

  if gh secret list --repo "$REPO" 2>/dev/null | grep -q "^$name\b"; then
    echo "  [ya existe] ¿Sobreescribir? (y/N)"
    read -r overwrite
    if [[ "$overwrite" != "y" && "$overwrite" != "Y" ]]; then
      echo "  Se deja como está."
      echo ""
      return 0
    fi
  fi

  echo "  Pegá el valor de $name (input oculto):"
  read -rs token
  if [ -z "$token" ]; then
    echo "  Vacío; se omite."
    echo ""
    return 0
  fi
  printf '%s' "$token" | gh secret set "$name" --repo "$REPO"
  echo "  Cargado."
  echo ""
}

set_secret "CLAUDE_CODE_OAUTH_TOKEN" "Token OAuth de Claude Code. Obtenelo con: claude setup-token"
set_secret "AGENT_PAT" "PAT classic con scopes repo + workflow. https://github.com/settings/tokens"

echo "============================================================"
echo "Secrets en $REPO (solo nombres, nunca valores):"
echo ""
gh secret list --repo "$REPO"
echo ""
echo "============================================================"
