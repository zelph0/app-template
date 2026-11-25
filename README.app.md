# {{name}} <!-- template:name -->

{{description}}

**Live site:** {{siteLink}}

## What it does

<!-- /new-app replaces this section with a short summary of docs/brief.md: who it's for and the
first-version features. When the brief changes, update this too. -->
Who it's for, what it does and what's planned: [`docs/brief.md`](docs/brief.md).

## Where it lives

| What | Where |
|---|---|
| Code | [github.com/{{repo}}](https://github.com/{{repo}}). `main` only changes through a pull request (PR) whose checks pass |
| Hosting | [Vercel project]({{vercelUrl}}): the live site, plus a preview site for every PR |
| Database | [Neon project]({{neonUrl}}): `main` is production, `dev` is for your computer, `test` for local tests, and `preview/…` one per PR |

## Run it on your computer

You need Node 24 and pnpm 12, plus logins to `gh` and Neon (`pnpm exec neon login`).

```bash
gh repo clone {{repo}}
cd {{slug}}
pnpm install
pnpm db:env      # writes .env.local, pointing at the "dev" database
pnpm dev         # http://localhost:3000
```

`pnpm db:env` asks Neon for the `dev` database's address, so you never copy passwords by hand.
Run it again whenever `.env.local` is lost or broken.

Sign in with an email code or Google. Your account starts empty: the sample data belongs to a <!-- @auth-module -->
demo user. To load it into your own account, add `SEED_USER_EMAIL="you@example.com"` to <!-- @auth-module -->
`.env.local` and run `pnpm db:seed` (this replaces that account's data on `dev`). <!-- @auth-module -->

## Making a change

Start Claude Code in this folder and describe the change. Claude reads [`CLAUDE.md`](CLAUDE.md)
and the brief, writes a spec in `docs/specs/`, works on a branch against the `dev` database, and
opens a PR. Then:

1. **CI** tests the PR on a throwaway copy of the database, and Vercel builds a **preview** site
   with its own database copy. Try the preview from the link on the PR.
2. When every check is green, **you merge**. A workflow applies any database change to
   production first, then deploys the live site.

[`docs/shipping-a-change.md`](docs/shipping-a-change.md) walks through each stage and what you
can check in GitHub, Vercel and Neon along the way.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run the app on <http://localhost:3000> against the `dev` database |
| `pnpm db:env` | Write `.env.local` for the `dev` database |
| `pnpm typecheck` / `pnpm lint` | Check types / check formatting and lint rules (`lint:fix` fixes them) |
| `pnpm test` | Unit tests (no database needed) |
| `pnpm db:test` | Rebuild the `test` database: apply migrations, load sample data |
| `pnpm test:integration` | Tests that talk to the `test` database |
| `pnpm test:e2e` | Browser tests (Playwright): builds the app and clicks through it |
| `pnpm db:migrate --name <change>` | Create a database migration on `dev` (Claude uses the `migrate` skill) |
| `pnpm db:seed` | Load sample data into `dev` (safe to repeat) |
| `pnpm db:studio` | Browse the `dev` database in your browser |

## Where things live

| Path | What's there |
|---|---|
| `docs/brief.md` | What the app is for: who, features, data, quality requirements, build order |
| `docs/specs/` | One spec per feature, written before it's built |
| `src/features/` | The features. `tasks/` is the example the others copy |
| `src/styles/theme.css`, `src/config/fonts.ts` | The app's look. Check it at <http://localhost:3000/styleguide> |
| `prisma/` | Database schema, migrations and sample data |
| `tests/` | `unit/`, `integration/` and `e2e/` tests |
| `.claude/` | Claude Code settings, safety hooks, skills and the reviewer agent |
| `.github/workflows/` | CI, the production migrate-and-deploy, preview database clean-up |
| `docs/decisions/` | Why things are the way they are |

## When something goes wrong

| Symptom | Fix |
|---|---|
| The app says an environment variable is missing | `pnpm db:env` |
| Integration or e2e tests fail on the database | `pnpm db:test` to rebuild the test database |
| `Executable doesn't exist` from Playwright | `pnpm exec playwright install chromium` |
| pnpm refuses a package that is "less than a day old" | Intended (it guards against bad releases). Use the previous version |
| Prisma suggests upgrading to 8 | Ignore it. Prisma is pinned to 7 on purpose ([decision 0001](docs/decisions/0001-prisma-7-pin.md)) |
| A PR can't merge | A check failed. Open the PR's **Checks** tab, or ask Claude to fix CI |
| The live site is broken after a merge | Vercel → **Deployments** → the previous production one → **Instant Rollback**, then fix it in a PR |

---

Created from [{{templateRepo}}](https://github.com/{{templateRepo}}) with `/new-app`.
