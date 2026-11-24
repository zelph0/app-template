# App Template <!-- template:name -->

AI-first Next.js starter: Neon Postgres (branch per PR), Prisma 7, optional Neon Auth,
Tailwind 4 + shadcn/ui with a token-based theme, Vitest + Playwright, and Claude Code
harness files. Every app starts from this repo; see `TEMPLATE_SPEC.md` for the why.

## Quick start

```bash
pnpm install
pnpm dev            # http://localhost:3000, against the Neon "dev" branch (.env.local)
```

`.env.local` is written by the provisioning script (or copy `.env.example`).

## Everyday commands

| Command                           | What it does                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev`                        | Dev server on the Neon `dev` branch                                             |
| `pnpm typecheck` / `pnpm lint`    | Types (incl. route types) / Biome lint + format check                           |
| `pnpm test`                       | Unit tests (no database)                                                        |
| `pnpm db:test`                    | Reset the disposable Neon `test` branch, migrate, seed, write `.env.test.local` |
| `pnpm test:integration`           | Integration tests against the `test` branch                                     |
| `pnpm test:e2e`                   | Playwright (builds and starts the app against the `test` branch)                |
| `pnpm db:migrate --name <change>` | Create + apply a migration on `dev` (see `.claude/skills/migrate`)              |
| `pnpm db:seed`                    | Idempotent realistic data                                                       |
| `pnpm auth:remove`                | Remove the auth module (provisioning does this when an app has no auth)         |

## Where things live

- `src/features/tasks/`: **the reference feature.** Copy its shape for new features.
- `src/modules/auth/`: the removable auth module. Integration points: `docs/template-contract.md`.
- `src/styles/theme.css` + `src/config/fonts.ts`: the theme. See `docs/theming.md`.
- `template.config.ts`: app name, slug and description (placeholders).
- `docs/decisions/`: why things are the way they are. `docs/specs/`: feature specs.
