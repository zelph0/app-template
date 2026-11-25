# Template contract

What the provisioning script (build step 2) and `/new-app` (step 3) may change, and how,
so they customize this template without rewriting it. If you change any of this, update this
file and the scripts that depend on it in the same PR.

## 1. Placeholders

App identity lives in **one** file: `template.config.ts`.

| Field | Used by |
|---|---|
| `name` | `<title>` + metadata, OG image, header, home page, README title |
| `slug` | `package.json` `name` (lowercase letters, digits, dashes) |
| `description` | `<meta name="description">`, OpenGraph, OG image, home page |
| `locale` | `<html lang>` |

Files that can't import TypeScript are kept in sync by `pnpm template:sync`:

- `package.json` → `"name"` = `slug`
- `README.md` → the line ending in `<!-- template:name -->` gets `name`

`pnpm template:check` (run in CI) fails if they drift.

**Provisioning:** rewrite the `name`, `slug` and `description` values in `templateConfig`
(`scripts/lib/template-config.ts`), then run `pnpm template:sync`. Keep each on its own
`key: "value",` line; the rewrite fails loudly otherwise.

Per-environment values are **not** placeholders: database URLs, Neon Auth URL, Sentry DSN and
the like come from env vars (`.env.example`, validated in `src/env.ts`). Also written by
provisioning (not secret):

- `neon.project.json`: Neon project id, production branch name/id, dev/test branch names. Read by the
  db scripts and the `neon-guard` hook.
- `.mcp.json`: the Neon MCP URL's `projectId=`.
- `.neon` (gitignored): local Neon CLI context, pinned to the `dev` branch.

## 2. Removable auth module

All auth code lives in `src/modules/auth/`. `pnpm auth:remove` (`scripts/remove-auth.ts`)
removes it deterministically and is idempotent. CI runs every check in both variants
(`db-e2e (auth)` and `db-e2e (noauth)`).

### Integration points (the complete list)

| # | File | Role | Without auth |
|---|---|---|---|
| 1 | `src/lib/viewer.ts` | **The** seam features use: `requireViewer()`, `getViewer()` | points to `src/lib/single-owner.ts` (one implicit owner) |
| 2 | `src/lib/auth-ui.ts` | Header account slot (`HeaderAccount`) | no-op component |
| 3 | `src/proxy.ts` | Route protection (private by default, `PUBLIC_ROUTES`) | deleted |
| 4 | `src/app/api/auth/[...path]/route.ts` | Auth API proxy | deleted |
| 5 | `src/app/auth/sign-in/page.tsx` | Sign-in page | deleted |
| 5b | `src/app/api/auth/email-hook/route.ts` | Branded auth email webhook (Resend; inactive without `RESEND_API_KEY` + `EMAIL_FROM`) | deleted |
| 6 | `src/env.ts` | `extends: [authEnv]` | lines removed |
| 7 | `prisma/seed.ts` | Seed users via Neon Auth | single owner |
| 8 | `playwright.config.ts`, `tests/e2e/support/db.ts` | Logged-in setup project, user lookup | no setup project |
| 9 | `tests/e2e/auth/`, `tests/unit/auth-*.test.ts` | Auth tests | deleted |
| 10 | `.env.example`, `CLAUDE.md` | Auth env vars, auth docs | blocks removed |
| 11 | `package.json` | `@neon/auth` dependency | removed |

Files 3–5b are one-line re-exports or wrappers: the code they point to lives in the module.

### Markers `remove-auth` understands

- First line contains `@auth-module: file` → the file is deleted.
- A line **ending** with `// @auth-module`, `# @auth-module`, `{/* @auth-module */}` or `<!-- @auth-module -->` → the line is deleted.
- `// @no-auth: <code>` or `# @no-auth: <code>` → becomes `<code>`.
- Everything from a line containing `@auth-module:start` to `@auth-module:end` → deleted.
- `src/modules/auth/` and `tests/e2e/auth/` → deleted. `@neon/auth` → removed from package.json.

Then: `pnpm install` (updates the lockfile). The script formats rewritten files when Biome is installed.

Rule for new code: features never import `src/modules/auth`; use `@/lib/viewer`. If auth needs
a new integration point, mark it and add it to the table above.

## 3. Theme contract

Restyling an app means editing exactly two files plus, optionally, component variants:

- `src/styles/theme.css`: every design token (colour, radius, border width, density, shadows, motion, heading type), for light and dark.
- `src/config/fonts.ts`: font families (`next/font`).
- `src/components/ui/*`: `cva` variants, to change shape and feel beyond tokens.

Details and rules: `docs/theming.md`. Check the result on `/styleguide` (light and dark);
CI's axe check covers contrast on that page.

## 4. Optional features (not in the base)

Analytics, file uploads, rate limiting and background jobs are added by later provisioning
steps, never shipped in the base. Where they go:

- `src/modules/<name>/`: self-contained module (server code, components, `env.ts` with its own `createEnv`).
- Integration points: added to `src/env.ts` `extends`, a seam in `src/lib/` if features need it,
  and env vars in `.env.example`, each marked so the module can be removed the same way as auth.
- Product features (things users do) go in `src/features/<name>/` following `src/features/tasks/`.

## 5. Neon / Vercel / GitHub settings the template expects

| Where | Name | Set by |
|---|---|---|
| GitHub variable | `NEON_PROJECT_ID` | provisioning |
| GitHub secret | `NEON_API_KEY` | provisioning: Neon key scoped to the project (CI branch per run) |
| GitHub env secret (`production`) | `PROD_DATABASE_URL_UNPOOLED` | provisioning (production migrations; the environment only deploys from `main`) |
| GitHub variables | `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | provisioning (enables production deploy + preview e2e) |
| GitHub secrets | `VERCEL_TOKEN` (scoped to the project), `VERCEL_AUTOMATION_BYPASS_SECRET` | provisioning |
| GitHub secret | `CLAUDE_CODE_OAUTH_TOKEN` | `/install-github-app` (manual: no CLI can fetch it) |
| GitHub ruleset | `protect-main`: PR required; checks `checks`, `secret scan`, `db-e2e (auth)`, `db-e2e (noauth)` | provisioning |
| Vercel env | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_AUTH_BASE_URL` (production + per preview) | the Vercel-managed Neon integration |
| Vercel env | `NEON_AUTH_COOKIE_SECRET` (production, preview) | provisioning |
| Vercel env | `SENTRY_DSN`, `RESEND_API_KEY`, `EMAIL_FROM` (optional) | you, when the app needs them |
| Neon Auth (production branch) | providers; trusted domains `https://<slug>.vercel.app` + `https://*-<team>.vercel.app`; localhost allowed (CI and local tests branch from it) | provisioning |

If a required check is renamed in `ci.yml`, update `REQUIRED_CHECKS` in
`scripts/lib/provision/github.ts` (a unit test compares them).

## 6. Provisioning (`pnpm provision <slug>`)

`scripts/provision.ts` runs these steps in order. Each step checks real state first, so a re-run
skips finished steps (`↷ already done`) and resumes after a failure. `pnpm provision --help` lists
the options.

1. Create the GitHub repo from the template and clone it to `../<slug>`. Cancel the doomed CI run
   on the template's initial commit.
2. Create the `chore/provision` branch and run `pnpm install`.
3. Write the app identity to `template.config.ts`, then run `pnpm template:sync`.
4. With `--no-auth`: run `pnpm auth:remove`. With `--theme-dir`: copy the theme files.
5. Create the Vercel project, link the folder, and connect the repo.
6. Add Neon through the Vercel-managed integration (production + preview), and write the
   project files listed in §1.
7. Set up Neon Auth on the production branch. This runs before any other branch exists, because
   branches copy their parent's auth config.
8. Run `pnpm db:env`: creates the `dev` branch, writes `.env.local`, migrates and seeds.
9. Set the Vercel `NEON_AUTH_COOKIE_SECRET`. Create the GitHub `production` environment,
   variables, secrets, repo settings and ruleset (§5).
10. Run `typecheck`, `lint`, `test` and `build` in the new app.
11. Commit, push, and open the first PR.

Secrets are piped between CLIs through stdin; they never appear in argv or output.

`pnpm deprovision <slug>` undoes it after a typed confirmation: the Neon resource, the Vercel
project, the scoped tokens and keys, and the GitHub repo. Why the Vercel-managed integration:
`docs/decisions/0009-vercel-managed-neon-and-public-repos.md`.
