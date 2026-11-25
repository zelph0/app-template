# 0011: Provisioning builds `main` as production before pushing the first PR

Date: 2026-11-25 · Status: accepted

**Context.** Vercel makes a new project's **first deployment production, whatever its branch**.
`link.productionBranch` is `main` from the start, but it isn't used for that first deployment.
Vercel's docs don't describe this. Community threads report it ([1], [2]), and we saw it ourselves:

- `smoke-notes`: the first deployment was the `chore/provision` PR, with `source: git` and
  `target: production`. It was the project's only production deployment.
  `vercel-build` failed it ("Production: checking every migration has been applied…", `init`
  pending), so the PR got a failed Vercel check and no preview. The next push to the same branch
  deployed as a normal preview.
- A probe (2026-11-25, Vercel CLI 66.6.0, hobby team, throwaway repo with
  `git.deploymentEnabled.main: false`):
  - A fresh project connected to the repo, then a push to `feat/control`: built as
    `target: production`. That reproduces the bug.
  - A second fresh project: after `project add`, `link`, `git connect` and `deploy-hooks create
    --git-branch main`, `targets` was `{}`. POSTing the hook returned only
    `{"job":{"id":…,"state":"PENDING"}}`, with no deployment id. About 8s later,
    `targets.production` was a `main` deployment with `meta.deployHookId`. The hook builds `main`
    even with Git deploys of `main` off. A push to `chore/provision` afterwards deployed as a
    preview (`target: null`).
- On `smoke-notes`, `targets.production` is the **ERROR** deployment and later pushes are
  previews. So a failed production deployment is enough.

The template turns off Git deploys of `main` (`vercel.json`). Production is only ever built by the
deploy hook that `migrate-prod.yml` calls. So the first thing Vercel saw for a new app was the PR.

**Decision.** Add a provisioning step, `vercel-first-production`, that runs after the deploy hook
exists and before the PR is pushed:
- If `targets.production` (`/v9/projects/<slug>`) is missing or CANCELED, POST the deploy hook. The
  URL goes to `curl -K -` on stdin, never in argv.
- Wait (up to 15 min) until `targets.production` is READY or ERROR.
- The step is done once a READY or ERROR production deployment exists, so a re-run skips it. A
  re-run during the build waits without triggering another one.

That build of `main` usually **fails**: production hasn't been migrated yet, and `vercel-build`
refuses a production build with pending migrations. That is expected. Merging the first PR runs
`migrate-prod.yml`, which migrates and then deploys production properly.

**Consequences.**
- Provisioning takes a few minutes longer: one production build of the template commit on `main`.
- A new app's Vercel dashboard (and its GitHub deployments) shows a failed production deployment
  until the first PR is merged. The PR body says so.
- We rely on undocumented Vercel behaviour. If Vercel changes it, the step only costs one extra
  build.
- CANCELED doesn't count as a production deployment, because we haven't tested whether Vercel
  counts it. A re-run triggers the hook again.

[1]: https://community.vercel.com/t/first-deployment-is-forced-to-production-even-for-a-preview-branch-and-target-preview/46300
[2]: https://community.vercel.com/t/first-deployment-on-empty-hobby-project-is-classified-as-production-even-from-preview-branch/49203
