# 0012: `/new-app` writes an app brief, and compares styles with a switcher

Date: 2026-11-25 · Status: accepted

**Context.** The first real app (`smoke-notes`) showed two gaps. The app's purpose lived only in
one sentence and in the chat where it was created, so later sessions had nothing to plan against.
And the side-by-side style comparison made it hard to judge a style as a whole: four component
sheets in a grid, rather than one screen changing in place.

**Decision.**
- **An app brief, `docs/brief.md`.** `/new-app` drafts it from the user's sentence and asks a few
  multiple-choice questions, so the user reacts rather than writes. It covers functional
  requirements (who, journeys, features by priority, the data) and quality requirements as a
  table of defaults the template already meets. The user changes only rows that differ, so no
  system-design vocabulary is needed. It ends with what the template can't do yet and a build
  order, one PR per line. `CLAUDE.md` points every session at it before a spec.
- **A style switcher at `/styleguide/compare`.** One example screen (an app screen, sign-in, or
  every component) in one candidate at a time, with buttons and number keys to flip between
  candidates and the current style. The side-by-side grid moves to
  `/styleguide/compare/side-by-side`. `pnpm style:check` runs axe on both.

**Consequences.**
- The template's own `docs/brief.md` is the blank form, so a new app starts with it and `/new-app`
  replaces it.
- The switcher's example screen is a third place, besides `preview-sheet.tsx`, with auth markers
  (`docs/template-contract.md` §2, row 12).
- `style:check` takes about twice as long (two pages per candidate and colour scheme), around
  25s for four candidates.
