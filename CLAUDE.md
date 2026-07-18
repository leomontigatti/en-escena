# En Escena — guía para Claude Code

Índice de las convenciones del repo. Cada regla operativa vive en su archivo bajo
`docs/agents/` (o `.sandcastle/`); este archivo solo enruta.

- **Comandos y validación**: [docs/agents/workflows.md](docs/agents/workflows.md).
  Usar `pnpm typecheck` (no `pnpm exec tsc`); un hook lo enforcea. No correr
  `pnpm typecheck` en paralelo con `pnpm build`.
- **Investigar antes de implementar**: ver la sección homónima en
  [docs/agents/workflows.md](docs/agents/workflows.md).
- **Coding standards**: [.sandcastle/CODING_STANDARDS.md](.sandcastle/CODING_STANDARDS.md)
  (canónico). Guía de todo el repo, no solo de Sandcastle.
- **Style guide** (frontend/UI): [docs/agents/style-guide.md](docs/agents/style-guide.md).
- **Issue tracker** (GitHub Issues vía `gh`): [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
- **Triage labels**: [docs/agents/triage-labels.md](docs/agents/triage-labels.md).
- **Domain docs** (layout de contexto único): [docs/agents/domain.md](docs/agents/domain.md).
- **Operación local y auth** (DB, Supabase Auth, email-log): [docs/local-auth.md](docs/local-auth.md).
- **Fallow** (auditoría e investigación, no gate de commit): [docs/agents/fallow.md](docs/agents/fallow.md).
- **Plataforma AFK** (spec de los 8 workflows, fuente de verdad; vendorizado de Matt Pocock):
  [docs/agents/afk-agent-platform-spec.md](docs/agents/afk-agent-platform-spec.md); qué se
  adaptó en [docs/agents/afk-vendored-assets.md](docs/agents/afk-vendored-assets.md).
