# Shipping a change, from idea to production

How one change (say, a new feature that adds a database table) travels from your laptop to the
live site, what happens automatically at each stage, and what you can check yourself. Nothing
here is required: CI and the deploy workflow check the important things. The manual checks are
for understanding the process and for catching a surprise early.

**Words used below.**
- *CI* (continuous integration): GitHub Actions that build and test every PR automatically.
- *Preview*: a private copy of the site Vercel builds for each PR, with its own database copy.
- *Migration*: a file in `prisma/migrations/` with the SQL that changes the database's shape.
  The same file runs on every database, in order, so they all end up with the same shape.

## The stages at a glance

| Stage | Code is on | Database used | Who acts |
|---|---|---|---|
| 1. Build it | your branch, on your laptop | Neon `dev` | you and Claude |
| 2. Open a PR | GitHub | a throwaway `ci/…` branch per CI run, plus `preview/<branch>` for the preview site | CI and Vercel, automatically |
| 3. Merge | `main` | Neon `main` (production) | the `migrate-prod` workflow, automatically |
| 4. Clean up | — | `preview/<branch>` deleted | the `neon-cleanup` workflow, automatically |

## 1. Build it (your laptop)

Ask Claude for the change in a new session in the app's folder. Claude should:
1. Read `docs/brief.md`, then write a spec in `docs/specs/<feature>.md` and agree it with you.
2. Create a branch (`feat/<name>`). Never work on `main`.
3. For a database change, use the `migrate` skill: edit `prisma/schema.prisma`, then
   `pnpm db:migrate --name <change>`. That writes a migration file and applies it to `dev` only.
4. Build the feature, with tests.

**Check yourself:**
- `pnpm dev` and try it at <http://localhost:3000>.
- In the Neon console, open your project → **Branches** → `dev` → **Tables**: the new table or
  column is there. `main` doesn't have it yet, and shouldn't.
- `git status` shows a new folder under `prisma/migrations/`. That folder is the change that will
  reach production. If a schema change has no migration, `pnpm db:check` fails.

## 2. Open a PR (GitHub + Vercel)

Claude commits, pushes and opens the PR (or `/ship` does it all). Two things start on their own:

- **CI** (`.github/workflows/ci.yml`): typecheck, lint, unit tests, a secret scan, then
  `db-e2e` twice, with and without sign-in. Each `db-e2e` run creates a temporary Neon branch,
  applies every migration from scratch, loads sample data, runs the browser tests and deletes the
  branch. A broken migration fails here, long before production.
- **Vercel preview**: Vercel builds the branch, the Neon integration creates
  `preview/<branch>` (a copy of production's data, made at that moment), and the build applies
  your migration to that copy. `e2e-preview.yml` then runs the browser tests against the preview.

**Check yourself:**
- The PR page lists every check. All must be green before GitHub allows a merge.
- The Vercel bot comments a **Preview** link. Open it and try the feature on real-looking data.
- Neon console → **Branches**: `preview/<your-branch>` exists and has the new table.
  Production's `main` still doesn't.

If a check fails, open it from the PR (**Checks** tab) or ask Claude to fix CI.

## 3. Merge (production)

You merge the PR (squash). `main` is protected: only a green PR can land there. Then
`migrate-prod.yml` runs two jobs in order:

1. **migrate production**: applies any new migration to Neon `main`.
2. **deploy production**: calls a Vercel deploy hook to build `main` as the live site.

The order matters: the database gets the new shape *before* code that needs it goes live. That's
also why migrations follow *expand/contract*: add things first and remove old ones in a later PR,
so the code running at any moment works with the database at that moment
([decision 0004](decisions/0004-migrations-expand-contract.md)).

Pushes to `main` don't deploy on their own (`vercel.json` turns that off). Production only ever
deploys through this workflow, so it can't go live before its migration.

**Check yourself:**
- GitHub → **Actions** → "Production migrate & deploy": both jobs green.
- Neon console → `main` → **Tables**: the new table is there now.
- `https://<your-site>/api/health` returns `"db":"ok"` and a `commit` that matches the merge
  commit on `main`.
- Try the feature on the live site.

## 4. Clean up (automatic)

When the PR closes, `neon-cleanup.yml` deletes `preview/<branch>`. It also runs when a git branch
is deleted, so a branch pushed without a PR doesn't leave a database behind. Afterwards Neon
should list only `main`, `dev` and `test` (plus any open PR's preview).

## If something goes wrong in production

- **The migration job failed**: nothing was deployed, and the old site keeps running. Read the
  job's log, fix it in a new PR. Never edit a migration that has already run anywhere; add a new
  one.
- **The site is broken but the data is fine**: in Vercel, **Deployments** → the previous
  production deployment → **Instant Rollback**. Then fix it in a PR.
- **Data needs undoing**: Neon can restore a branch to an earlier moment (**Restore** in the
  console). The `migrate` skill covers rollback in detail.
