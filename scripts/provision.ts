/**
 * `pnpm provision <slug> [options]`: creates a new app from this template, fully wired:
 * GitHub repo (from the template), Vercel project (Git-connected), Neon database through the
 * Vercel-managed integration (production + a database branch per preview), Neon Auth, the `dev`
 * branch + .env.local, GitHub secrets/variables/ruleset, then opens the app's first PR.
 *
 * Deterministic and idempotent: every step reads real state first, so re-running the same command
 * skips what's done and resumes after a failure. Never asks for secrets: it uses your `gh`, `neon`
 * and `vercel` logins and pipes keys between them. `pnpm provision --help` for options;
 * `pnpm deprovision <slug>` undoes it. Contract: docs/template-contract.md.
 */
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createCli, parseJson } from "./lib/cli";
import {
  devDatabaseStep,
  identityStep,
  installStep,
  pullRequestStep,
  removeAuthStep,
  themeStep,
  verifyStep,
} from "./lib/provision/app";
import { type Context, type Logger, type Resolved, runSteps, type Step } from "./lib/provision/context";
import {
  assertOurRepo,
  environmentStep,
  getRepo,
  repoSettingsStep,
  repoStep,
  rulesetStep,
  workBranchStep,
} from "./lib/provision/github";
import { neonAuthStep, neonFilesStep, neonResourceStep } from "./lib/provision/neon";
import { parseProvisionArgs, USAGE } from "./lib/provision/options";
import { secretsStep, variablesStep } from "./lib/provision/secrets";
import { cookieSecretStep, vercelGitStep, vercelProjectStep } from "./lib/provision/vercel";

/** In order: each step may rely on facts recorded by the ones before it. */
export const STEPS: Step[] = [
  repoStep,
  workBranchStep,
  installStep,
  identityStep,
  removeAuthStep,
  themeStep,
  vercelProjectStep,
  vercelGitStep,
  neonResourceStep,
  neonFilesStep,
  neonAuthStep,
  devDatabaseStep,
  cookieSecretStep,
  environmentStep,
  variablesStep,
  secretsStep,
  repoSettingsStep,
  rulesetStep,
  verifyStep,
  pullRequestStep,
];

const TEMPLATE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const log: Logger = { info: (m) => console.error(m), warn: (m) => console.error(m) };

function preflight(argv: string[]): Context {
  const opts = parseProvisionArgs(argv);
  const cli = createCli(TEMPLATE_ROOT);

  const major = Number(process.versions.node.split(".")[0]);
  if (major !== 24) throw new Error(`Node 24 required (found ${process.versions.node}). Run \`nvm use\`.`);

  const need = (what: string, login: string, fn: () => string) => {
    try {
      return fn();
    } catch {
      throw new Error(`Not logged in to ${what}. Run \`${login}\` once, then re-run.`);
    }
  };
  const ghUser = need("GitHub", "gh auth login", () => cli.gh(["api", "user", "--jq", ".login"]));
  need("Neon", "pnpm exec neon login", () => cli.neon(["me", "--output", "json"]));
  type Whoami = { team?: { id: string; slug: string }; teams?: { id: string; slug: string }[] };
  const whoami = need("Vercel", "pnpm exec vercel login", () =>
    cli.vercel(["whoami", "--format", "json"], { cwd: TEMPLATE_ROOT }),
  );
  const vercel = parseJson<Whoami>(whoami, "vercel whoami");
  const scope = opts.scope ?? vercel.team?.slug;
  const team = [vercel.team, ...(vercel.teams ?? [])].find((t) => t && (t.slug === scope || t.id === scope));
  if (!scope || !team) throw new Error(`Vercel team "${scope ?? "?"}" not found for your login. Pass --scope.`);

  const template =
    opts.template ??
    cli.gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], { cwd: TEMPLATE_ROOT });
  const resolved: Resolved = { ...opts, owner: opts.owner ?? ghUser, template, scope: team.slug, teamId: team.id };
  const ctx: Context = {
    opts: resolved,
    cli,
    repo: `${resolved.owner}/${resolved.slug}`,
    appDir: resolved.dir,
    facts: {},
    log,
  };

  const templateRepo = getRepo(ctx, template);
  if (!templateRepo?.is_template)
    throw new Error(`${template} isn't a GitHub template repo (Settings → Template repository).`);
  const existing = getRepo(ctx);
  if (existing) assertOurRepo(ctx, existing);
  return ctx;
}

function summary(ctx: Context) {
  const f = ctx.facts;
  return {
    slug: ctx.opts.slug,
    dir: ctx.appDir,
    repo: `https://github.com/${ctx.repo}`,
    pr: f.prUrl ?? null,
    vercel: `https://vercel.com/${ctx.opts.scope}/${ctx.opts.slug}`,
    neon: f.neonProjectId ? `https://console.neon.tech/app/projects/${f.neonProjectId}` : null,
    neonProjectId: f.neonProjectId ?? null,
    auth: ctx.opts.auth,
  };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.info(USAGE);
    return;
  }
  const ctx = preflight(argv);
  log.info(`Provisioning ${ctx.repo} → ${ctx.appDir} (Vercel team ${ctx.opts.scope}, Neon ${ctx.opts.region})\n`);
  const outcomes = runSteps(STEPS, ctx);
  const result = summary(ctx);

  log.info(`\nDone. ${outcomes.filter((o) => o.status === "done").length} step(s) changed something.`);
  log.info(`  App folder  ${result.dir}`);
  log.info(`  GitHub      ${result.repo}`);
  if (result.pr) log.info(`  First PR    ${result.pr}`);
  log.info(`  Vercel      ${result.vercel}`);
  if (result.neon) log.info(`  Neon        ${result.neon}`);
  log.info(
    "\nOne manual step left: in Claude Code inside the app, run `/install-github-app` (adds CLAUDE_CODE_OAUTH_TOKEN for @claude).",
  );
  log.info("Merge the PR when CI is green: that migrates production and deploys it.");
  if (ctx.opts.json) console.info(JSON.stringify({ ...result, steps: outcomes }, null, 2));
}

const isMain = process.argv[1] && relative(process.cwd(), process.argv[1]).endsWith("scripts/provision.ts");
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`\n${(error as Error).message}`);
    process.exit(1);
  }
}
