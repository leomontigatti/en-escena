# Research

The sources the `research` agent prefers for this stack.

- **Pinned versions**: `package.json` and `pnpm-lock.yaml`; the Node version is `.nvmrc`.
- **Sources**: the npm registry's JSON (`https://registry.npmjs.org/<package>`), the library's
  own repo (raw GitHub files, where a docs site's Markdown usually lives), MDN for the web
  platform, and the spec. ARCA's own regulations for anything fiscal
  ([docs/research/](../research/) holds what was already read).
- **A durable primary source** worth keeping is written to `docs/research/<kebab-name>.md`, at a
  path the spawning session names, and committed on that session's branch
  ([issue-tracker.md](issue-tracker.md#research-tickets)).
