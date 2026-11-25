/** Steps that change the new app's files (identity, auth module, theme), check it, and open the PR. */
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { succeeds } from "../cli";
import { renderTemplateConfig } from "../template-config";
import { type Context, type Step, WORK_BRANCH } from "./context";

const inApp = (ctx: Context, path: string) => join(ctx.appDir, path);
const pnpm = (ctx: Context, args: string[]) => ctx.cli.pnpm(args, { cwd: ctx.appDir, inherit: true });

export const installStep: Step = {
  id: "install",
  title: "Install dependencies",
  isDone: (ctx) => existsSync(inApp(ctx, "node_modules/.modules.yaml")),
  run: (ctx) => pnpm(ctx, ["install", "--frozen-lockfile"]),
};

/** Options that shape what gets created. Re-runs must match them; identity and theme may change. */
export function recordedOptions(ctx: Context) {
  const { owner, visibility, auth, providers, region, scope } = ctx.opts;
  return { owner, visibility, auth, providers: [...providers].sort(), region, scope };
}

/** Pure: throws when a re-run's options differ from the ones the app was provisioned with. */
export function assertSameOptions(recorded: Record<string, unknown>, current: Record<string, unknown>) {
  const changed = Object.keys(current).filter((k) => JSON.stringify(recorded[k]) !== JSON.stringify(current[k]));
  if (changed.length > 0) {
    throw new Error(
      `This app was provisioned with different options (${changed
        .map((k) => `${k}: ${JSON.stringify(recorded[k])} → ${JSON.stringify(current[k])}`)
        .join(", ")}). Re-run with the original options; changing them after the fact isn't supported.`,
    );
  }
}

const OPTIONS_FILE = "provision.json";

export const optionsStep: Step = {
  id: "options",
  title: `Record the provisioning options (${OPTIONS_FILE})`,
  isDone(ctx) {
    const file = inApp(ctx, OPTIONS_FILE);
    if (!existsSync(file)) return false;
    assertSameOptions(JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>, recordedOptions(ctx));
    return true;
  },
  run(ctx) {
    writeFileSync(inApp(ctx, OPTIONS_FILE), `${JSON.stringify(recordedOptions(ctx), null, 2)}\n`);
    if (existsSync(inApp(ctx, "node_modules/.bin/biome"))) {
      ctx.cli.pnpm(["exec", "biome", "format", "--write", OPTIONS_FILE], { cwd: ctx.appDir });
    }
  },
};

const identityOf = (ctx: Context) => ({ name: ctx.opts.name, slug: ctx.opts.slug, description: ctx.opts.description });

export const identityStep: Step = {
  id: "identity",
  title: "App identity (template.config.ts + template:sync)",
  isDone(ctx) {
    const file = inApp(ctx, "template.config.ts");
    const source = readFileSync(file, "utf8");
    if (renderTemplateConfig(source, identityOf(ctx)) !== source) return false;
    return succeeds(() => ctx.cli.pnpm(["template:check"], { cwd: ctx.appDir }));
  },
  run(ctx) {
    const file = inApp(ctx, "template.config.ts");
    writeFileSync(file, renderTemplateConfig(readFileSync(file, "utf8"), identityOf(ctx)));
    ctx.cli.pnpm(["template:sync"], { cwd: ctx.appDir });
  },
};

/** Runs before the dev database exists: the seed differs without auth. */
export const removeAuthStep: Step = {
  id: "remove-auth",
  title: "Remove the auth module",
  skip: (ctx) => (ctx.opts.auth ? "app keeps auth" : false),
  isDone: (ctx) =>
    !existsSync(inApp(ctx, "src/modules/auth")) &&
    !readFileSync(inApp(ctx, "package.json"), "utf8").includes("@neon/auth"),
  run(ctx) {
    pnpm(ctx, ["auth:remove"]);
    pnpm(ctx, ["install", "--no-frozen-lockfile"]);
  },
};

/** What `/new-app`'s styling step hands over: theme.css, fonts.ts and optional component variants. */
export function themeFiles(themeDir: string): { from: string; to: string }[] {
  const files: { from: string; to: string }[] = [];
  const add = (from: string, to: string) =>
    existsSync(join(themeDir, from)) && files.push({ from: join(themeDir, from), to });
  add("theme.css", "src/styles/theme.css");
  add("fonts.ts", "src/config/fonts.ts");
  const ui = join(themeDir, "components/ui");
  if (existsSync(ui)) {
    for (const name of readdirSync(ui).filter((f) => f.endsWith(".tsx"))) {
      files.push({ from: join(ui, name), to: `src/components/ui/${name}` });
    }
  }
  if (files.length === 0)
    throw new Error(`--theme-dir ${themeDir} has none of theme.css, fonts.ts, components/ui/*.tsx.`);
  return files;
}

export const themeStep: Step = {
  id: "theme",
  title: "Apply the theme",
  skip: (ctx) => (ctx.opts.themeDir ? false : "no --theme-dir: keeping the template's look"),
  isDone: (ctx) =>
    themeFiles(ctx.opts.themeDir ?? "").every(
      ({ from, to }) =>
        existsSync(inApp(ctx, to)) && readFileSync(from, "utf8") === readFileSync(inApp(ctx, to), "utf8"),
    ),
  run(ctx) {
    for (const { from, to } of themeFiles(ctx.opts.themeDir ?? "")) copyFileSync(from, inApp(ctx, to));
  },
};

/** `prisma migrate status` exits non-zero while migrations are pending (or the DB is unreachable). */
const devIsMigrated = (ctx: Context) =>
  succeeds(() => ctx.cli.pnpm(["exec", "prisma", "migrate", "status"], { cwd: ctx.appDir }));

export const devDatabaseStep: Step = {
  id: "dev-database",
  title: "Dev database (Neon `dev` branch, .env.local, migrate + seed)",
  isDone: (ctx) =>
    existsSync(inApp(ctx, ".env.local")) &&
    readFileSync(inApp(ctx, ".env.local"), "utf8").includes("DATABASE_URL=") &&
    branchExists(ctx, "dev") &&
    devIsMigrated(ctx),
  run(ctx) {
    pnpm(ctx, ["db:env"]);
    // db:env migrates + seeds only when it creates the branch. If an earlier run stopped after
    // creating it, finish the job here (the seed is safe to repeat).
    if (!devIsMigrated(ctx)) {
      pnpm(ctx, ["exec", "prisma", "migrate", "deploy"]);
      pnpm(ctx, ["exec", "prisma", "db", "seed"]);
    }
  },
};

function branchExists(ctx: Context, name: string): boolean {
  if (!ctx.facts.neonProjectId) return false;
  const out = ctx.cli.neon(["branches", "list", "--project-id", ctx.facts.neonProjectId, "--output", "json"]);
  return (JSON.parse(out) as { name: string }[]).some((b) => b.name === name);
}

export const verifyStep: Step = {
  id: "verify",
  title: "Typecheck, lint, unit tests and build in the new app",
  skip: (ctx) => (ctx.opts.verify ? false : "--no-verify"),
  isDone: () => false,
  run(ctx) {
    for (const script of ["typecheck", "lint", "test", "build"]) pnpm(ctx, [script]);
  },
};

const git = (ctx: Context, args: string[]) => ctx.cli.git(args, { cwd: ctx.appDir });

/**
 * The work branch's PR in one of `states`. isDone accepts open or merged (a closed-unmerged PR
 * doesn't count); run only reuses an open one, so changes made after a merge get a new PR.
 */
function findPr(ctx: Context, states = ["OPEN", "MERGED"]): string | null {
  const out = ctx.cli.gh([
    "pr",
    "list",
    "-R",
    ctx.repo,
    "--head",
    WORK_BRANCH,
    "--state",
    "all",
    "--json",
    "url,state",
  ]);
  return (JSON.parse(out) as { url: string; state: string }[]).find((p) => states.includes(p.state))?.url ?? null;
}

export function prBody(ctx: Context): string {
  const f = ctx.facts;
  return [
    `Provisioned by \`pnpm provision ${ctx.opts.slug}\` from ${ctx.opts.template}.`,
    "",
    "## What was set up",
    `- Neon project \`${f.neonProjectId}\` (via the Vercel-managed integration), production branch \`${f.productionBranch?.name}\`, \`dev\` branch for local work`,
    `- Vercel project \`${ctx.opts.slug}\` in \`${ctx.opts.scope}\`, connected to this repo; previews get a \`preview/<branch>\` database`,
    `- Auth: ${ctx.opts.auth ? `email codes${ctx.opts.providers.length ? ` + ${ctx.opts.providers.join(", ")}` : ""}` : "removed (`pnpm auth:remove`)"}`,
    `- Theme: ${ctx.opts.themeDir ? "applied from `/new-app`" : "template default"}`,
    "- GitHub: Actions secrets/variables, `production` environment, `protect-main` ruleset",
    "",
    "## Checks run",
    ctx.opts.verify
      ? "`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` passed locally."
      : "Skipped (`--no-verify`).",
    "",
    "Merging this PR is the first production release: `migrate-prod.yml` applies migrations to production, then deploys.",
  ].join("\n");
}

export const pullRequestStep: Step = {
  id: "pull-request",
  title: "Commit, push and open the first PR",
  skip: (ctx) => (ctx.opts.pr ? false : "--no-pr"),
  isDone(ctx) {
    const url = findPr(ctx);
    if (url) ctx.facts.prUrl = url;
    const clean = git(ctx, ["status", "--porcelain"]) === "";
    const pushed = succeeds(() => git(ctx, ["rev-parse", "--verify", `refs/remotes/origin/${WORK_BRANCH}`]))
      ? git(ctx, ["rev-list", "--count", `origin/${WORK_BRANCH}..HEAD`]) === "0"
      : false;
    return url !== null && clean && pushed;
  },
  run(ctx) {
    if (git(ctx, ["status", "--porcelain"]) !== "") {
      git(ctx, ["add", "-A"]);
      git(ctx, ["commit", "-m", `chore: provision ${ctx.opts.slug}`]);
    }
    git(ctx, ["push", "-u", "origin", WORK_BRANCH]);
    const existing = findPr(ctx, ["OPEN"]);
    ctx.facts.prUrl =
      existing ??
      ctx.cli.gh(
        [
          "pr",
          "create",
          "-R",
          ctx.repo,
          "--base",
          "main",
          "--head",
          WORK_BRANCH,
          "--title",
          `chore: provision ${ctx.opts.slug}`,
          "--body-file",
          "-",
        ],
        { cwd: ctx.appDir, input: prBody(ctx) },
      );
  },
};
