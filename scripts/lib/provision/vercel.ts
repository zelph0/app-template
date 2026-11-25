import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CliError, parseJson, registerSecret } from "../cli";
import { type Context, type Step, waitFor } from "./context";

export type VercelProject = {
  id: string;
  name: string;
  accountId: string;
  link?: { type?: string; org?: string; repo?: string };
  gitProviderOptions?: { createDeployments?: string };
  protectionBypass?: Record<string, { scope?: string }>;
  /** The latest deployment per target. A new project has `{}`. */
  targets?: { production?: { id: string; readyState?: string } | null };
};

/** The app folder once it exists, else the template checkout (before the clone, in preflight). */
export const cwdFor = (ctx: Context) => (existsSync(ctx.appDir) ? ctx.appDir : process.cwd());

/** `vercel api` against the team, with the team id explicit (a slug alone doesn't override the CLI default). */
export function vercelApi(ctx: Context, path: string, options: { method?: string; body?: unknown } = {}): string {
  const sep = path.includes("?") ? "&" : "?";
  const args = ["api", `${path}${sep}teamId=${ctx.opts.teamId}`, "--raw"];
  if (options.method) args.push("-X", options.method);
  if (options.body !== undefined) args.push("--input", "-");
  return ctx.cli.vercel(args, {
    cwd: cwdFor(ctx),
    input: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export function getVercelProject(ctx: Context): VercelProject | null {
  try {
    return parseJson<VercelProject>(vercelApi(ctx, `/v9/projects/${ctx.opts.slug}`), "vercel api /v9/projects");
  } catch (error) {
    if (error instanceof CliError) return null;
    throw error;
  }
}

/**
 * The project's own `<name>.vercel.app` domain. Vercel assigns it when the project is created, so
 * it's known before anything is deployed. Null when it can't be read.
 */
export function productionDomain(ctx: Context): string | null {
  try {
    const { domains } = parseJson<{
      domains?: { name: string; gitBranch?: string | null; redirect?: string | null }[];
    }>(vercelApi(ctx, `/v9/projects/${ctx.opts.slug}/domains`), "vercel api /v9/projects/…/domains");
    return domains?.find((d) => !d.gitBranch && !d.redirect)?.name ?? null;
  } catch (error) {
    if (error instanceof CliError) return null;
    throw error;
  }
}

type LinkFile = { projectId: string; orgId: string; projectName?: string };

export function readLink(ctx: Context): LinkFile | null {
  const file = join(ctx.appDir, ".vercel", "project.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as LinkFile) : null;
}

export const vercelProjectStep: Step = {
  id: "vercel-project",
  title: "Vercel project, linked to the app folder",
  isDone(ctx) {
    const link = readLink(ctx);
    const project = link ? getVercelProject(ctx) : null;
    if (!link || !project || project.id !== link.projectId) return false;
    ctx.facts.vercelProjectId = link.projectId;
    ctx.facts.vercelOrgId = link.orgId;
    return true;
  },
  run(ctx) {
    if (!getVercelProject(ctx)) ctx.cli.vercel(["project", "add", ctx.opts.slug, "--scope", ctx.opts.scope]);
    ctx.cli.vercel(["link", "--yes", "--project", ctx.opts.slug, "--scope", ctx.opts.scope], { cwd: ctx.appDir });
    const link = readLink(ctx);
    if (!link) throw new Error("`vercel link` didn't write .vercel/project.json.");
    ctx.facts.vercelProjectId = link.projectId;
    ctx.facts.vercelOrgId = link.orgId;
  },
};

export const vercelGitStep: Step = {
  id: "vercel-git",
  title: "Connect the Vercel project to the GitHub repo",
  isDone(ctx) {
    const link = getVercelProject(ctx)?.link;
    return link?.type === "github" && `${link.org}/${link.repo}`.toLowerCase() === ctx.repo.toLowerCase();
  },
  run(ctx) {
    try {
      ctx.cli.vercel(["git", "connect", `https://github.com/${ctx.repo}.git`, "--yes"], { cwd: ctx.appDir });
    } catch (error) {
      throw new Error(
        `${(error as Error).message}\n\nIf Vercel can't see the repo, give the Vercel GitHub app access to it ` +
          '(https://github.com/apps/vercel/installations/new, ideally "All repositories"), then re-run.',
      );
    }
  },
};

/**
 * Project settings `vercel project add` leaves off: GitHub deployment events, which
 * e2e-preview.yml listens for (`deployment_status`). The framework is pinned in vercel.json.
 */
export const vercelSettingsStep: Step = {
  id: "vercel-settings",
  title: "Vercel project settings (GitHub deployment events)",
  isDone: (ctx) => getVercelProject(ctx)?.gitProviderOptions?.createDeployments === "enabled",
  run(ctx) {
    vercelApi(ctx, `/v9/projects/${ctx.opts.slug}`, {
      method: "PATCH",
      body: { gitProviderOptions: { createDeployments: "enabled" } },
    });
  },
};

type EnvVar = { key: string; target?: string[] | string };

/** Names of the project's env vars per target. Tolerates both `{ envs: [...] }` and a bare array. */
export function envTargets(ctx: Context): Map<string, Set<string>> {
  const raw = JSON.parse(ctx.cli.vercel(["env", "ls", "--format", "json"], { cwd: ctx.appDir })) as
    | EnvVar[]
    | { envs: EnvVar[] };
  const list = Array.isArray(raw) ? raw : raw.envs;
  const map = new Map<string, Set<string>>();
  for (const env of list) {
    const targets = Array.isArray(env.target) ? env.target : env.target ? [env.target] : [];
    const set = map.get(env.key) ?? new Set<string>();
    for (const t of targets) set.add(t);
    map.set(env.key, set);
  }
  return map;
}

const COOKIE_TARGETS = ["production", "preview"] as const;

export const cookieSecretStep: Step = {
  id: "vercel-cookie-secret",
  title: "NEON_AUTH_COOKIE_SECRET on Vercel (production + preview)",
  skip: (ctx) => (ctx.opts.auth ? false : "no auth"),
  isDone: (ctx) => {
    const targets = envTargets(ctx).get("NEON_AUTH_COOKIE_SECRET");
    return COOKIE_TARGETS.every((t) => targets?.has(t));
  },
  run(ctx) {
    const existing = envTargets(ctx).get("NEON_AUTH_COOKIE_SECRET");
    for (const target of COOKIE_TARGETS) {
      if (existing?.has(target)) continue; // never rotate: that would sign everyone out
      const value = registerSecret(randomBytes(32).toString("base64"));
      ctx.cli.vercel(["env", "add", "NEON_AUTH_COOKIE_SECRET", "-e", target, "--sensitive", "--yes"], {
        cwd: ctx.appDir,
        input: value,
      });
    }
  },
};

/** Returns the project's "Protection Bypass for Automation" secret, creating one if needed. */
/** Vercel requires exactly 32 alphanumeric characters: 16 random bytes as hex. */
export function ensureBypassSecret(ctx: Context): string {
  const existing = Object.entries(getVercelProject(ctx)?.protectionBypass ?? {}).find(
    ([, v]) => v.scope === "automation-bypass",
  );
  if (existing) return registerSecret(existing[0]);
  const secret = registerSecret(randomBytes(16).toString("hex"));
  vercelApi(ctx, `/v1/projects/${ctx.opts.slug}/protection-bypass`, {
    method: "PATCH",
    body: { generate: { secret, note: "GitHub Actions: e2e against previews" } },
  });
  return secret;
}

const DEPLOY_HOOK_NAME = "production (migrate-prod.yml)";
const HOOK_URL = /https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\/[\w/-]+/;

/**
 * A deploy hook that builds `main` as production. migrate-prod.yml calls it after migrating, instead
 * of a Vercel token: CLI sessions from "Sign in with Vercel" can't create tokens, and a hook can only
 * trigger a build of `main` (Git deploys of `main` are off in vercel.json).
 */
export function ensureDeployHook(ctx: Context): string {
  type Hooks = { hooks?: { name?: string; url?: string }[] };
  const listed = parseJson<Hooks>(
    ctx.cli.vercel(["deploy-hooks", "list", "--format", "json"], { cwd: ctx.appDir }),
    "vercel deploy-hooks list",
  );
  const existing = listed.hooks?.find((h) => h.name === DEPLOY_HOOK_NAME)?.url;
  if (existing) return registerSecret(existing);
  const out = ctx.cli.vercel(["deploy-hooks", "create", DEPLOY_HOOK_NAME, "--git-branch", "main"], {
    cwd: ctx.appDir,
  });
  const url = out.match(HOOK_URL)?.[0];
  if (!url) throw new Error("`vercel deploy-hooks create` returned no hook URL.");
  return registerSecret(url);
}

/**
 * Where the project's production deployment stands. READY and ERROR both count as "final": Vercel
 * only needs one to exist. A cancelled one doesn't count, since that case is untested.
 */
export type ProductionDeployment = "none" | "building" | "final";

export function productionDeployment(project: Pick<VercelProject, "targets"> | null): ProductionDeployment {
  const production = project?.targets?.production;
  if (!production || production.readyState === "CANCELED") return "none";
  return production.readyState === "READY" || production.readyState === "ERROR" ? "final" : "building";
}

/** curl config (read from stdin with `-K -`) that POSTs to the hook, so its URL never shows up in argv. */
export function deployHookRequest(url: string): string {
  if (!new RegExp(`^${HOOK_URL.source}$`).test(url)) throw new Error("The deploy hook URL doesn't look like Vercel's.");
  return `url = "${url}"\n`;
}

/**
 * Vercel makes a new project's FIRST deployment production, whatever its branch
 * (docs/decisions/0011). Git deploys of `main` are off (vercel.json), so without this the first
 * deployment would be the `chore/provision` PR, built as production, and `vercel-build` would fail
 * it on the pending migrations. The PR would then have a failed check and no preview. So build
 * `main` through the deploy hook first, and wait for that build to finish. It fails while
 * production has pending migrations, which is expected here: any production deployment, READY or
 * ERROR, makes Vercel deploy later branches as previews.
 */
export const firstProductionDeployStep: Step = {
  id: "vercel-first-production",
  title: "A first production deployment of main (so the PR deploys as a preview)",
  isDone: (ctx) => productionDeployment(getVercelProject(ctx)) === "final",
  run(ctx) {
    if (productionDeployment(getVercelProject(ctx)) === "none") {
      ctx.cli.curl(["-fsS", "-X", "POST", "-K", "-"], { input: deployHookRequest(ensureDeployHook(ctx)) });
      ctx.log.info("   Building main as production. It may fail on the pending migrations; either outcome is fine.");
    }
    waitFor(() => productionDeployment(getVercelProject(ctx)) === "final", {
      timeoutMs: 15 * 60_000,
      intervalMs: 10_000,
      what: "the production deployment of main to finish (see the Vercel dashboard)",
    });
  },
};
