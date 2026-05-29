---
inclusion: always
---

# Process Steering

This repository follows a tool-neutral AI development process. The full specification is **not** Kiro-specific; the canonical sources are:

- `AGENTS.md` — universal agent entry point (also linked as `CLAUDE.md` / `GEMINI.md` / `.cursorrules` / `.github/copilot-instructions.md`)
- `docs/process/00-overview.md` — process overview, state machine, all entry points
- `docs/process/01-requirements.md` ~ `06-archive.md` — per-phase specs (each independently readable)
- `docs/process/templates/` — required artifact templates (proposal / design / tasks / test-plan / release-notes / retrospective / STATUS / delta-spec)
- `docs/PROJECT_GUIDE.md` — project-specific knowledge (architecture, anti-detection, IPC model)

When working on this repository, always start by reading the files above. Kiro's spec UI may be used as an enhancement over `specs/changes/<slug>/`, but the markdown files in that folder remain the source of truth.

## Hard rules

1. Process data lives in `specs/` and `docs/process/`. Do not put it under `.kiro/`.
2. Every change goes through the full state machine (or the simplified path documented in `docs/process/00-overview.md` §5).
3. Every commit follows `<type>(<slug>): <subject>  [task: T-NN]`.
4. Every state transition (`draft → approved → designed → ...`) updates `STATUS.md` and is recorded in its `Log` section.
