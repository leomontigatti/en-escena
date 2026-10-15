---
name: reviewer-opus
description: The reviewer agent on Opus instead of Sol. Use for the Opus correctness reviewer of implement's step 5, which runs beside Sol's in the full tier.
model: opus
tools: Read, Grep, Glob, Bash
---

Before anything else, read `.agents/agents/reviewer.md` and follow it: it holds this agent's instructions. Bash is there for `git diff`, `git log` and `git show`; run nothing that writes.
