---
type: project
created: 2026-05-25
updated: 2026-07-12
---

# Project Conventions

## Git Workflow
- Always create a new dedicated branch for major code changes.
- Branch name format should follow: `feature/[task-slug]` or `fix/[bug-slug]`.
- **NEVER** run git add, commit, or push operations without explicit user permission.

## Mobile UI Port
- The React Native Android app should mirror the web app's mobile UI end-to-end.
- Preserve a responsive wide/tablet layout where the app already supports it.
- Complete tourist booking, profile/trips, and provider experiences sequentially; do not treat any as out of scope.

## Supported AI platforms (AG Kit)
- AG Kit **only supports Gemini CLI and Google Antigravity**.
- Do not claim compatibility with Claude Code, Cursor, Copilot, Windsurf, or other assistants unless the user explicitly expands scope.
- Copy on the website, docs, FAQ, README, and marketing should describe AG Kit as a toolkit for Gemini CLI / Antigravity-style agent setups.
