/**
 * Neon through the Vercel-managed integration: `vercel integration add neon` creates the Neon project
 * (in the "Vercel: <team>" Neon org) and injects DATABASE_URL, DATABASE_URL_UNPOOLED and
 * NEON_AUTH_BASE_URL into production and per-preview deployments. See docs/decisions/0009.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CliError, parseJson, registerSecret } from "../cli";
import type { Context, Step } from "./context";
import { envTargets } from "./vercel";

const NEON_PROJECT_ID = /\b[a-z]+-[a-z]+-\d{8}\b/;

/** The integration resource for this app, or null. Resource names equal the app slug. */
function inspectResource(ctx: Context): string | null {
  try {
    return ctx.cli.vercel(["integration-resource", "inspect", ctx.opts.slug, "--json", "--scope", ctx.opts.scope], {
      cwd: ctx.appDir,
    });
  } catch (error) {
    if (error instanceof CliError) return null;
    throw error;
  }
}

type NeonOrg = { id: string; name: string };
type NeonProject = { id: string; name: string; org_id?: string };

/** Finds the Neon project behind the resource: its id from `ir inspect`, else by name in the Vercel org(s). */
export function findNeonProject(ctx: Context): NeonProject | null {
  const inspected = inspectResource(ctx)?.match(NEON_PROJECT_ID)?.[0];
  const orgs = parseJson<NeonOrg[]>(ctx.cli.neon(["orgs", "list", "--output", "json"]), "neon orgs list").filter((o) =>
    o.name.startsWith("Vercel:"),
  );
  for (const org of orgs) {
    const projects = parseJson<NeonProject[]>(
      ctx.cli.neon(["projects", "list", "--org-id", org.id, "--output", "json"]),
      "neon projects list",
    );
    const match = projects.find((p) => (inspected ? p.id === inspected : p.name === ctx.opts.slug));
    if (match) return { ...match, org_id: org.id };
  }
  return null;
}

export const neonResourceStep: Step = {
  id: "neon-resource",
  title: "Neon database via Vercel (production + previews)",
  isDone(ctx) {
    if (inspectResource(ctx) === null) return false;
    const project = findNeonProject(ctx);
    if (!project) return false;
    ctx.facts.neonProjectId = project.id;
    ctx.facts.neonOrgId = project.org_id;
    return envTargets(ctx).get("DATABASE_URL")?.has("production") === true;
  },
  run(ctx) {
    // Never `development`: that would point local dev at production. Local dev uses the `dev` branch (db:env).
    const environments = ["-e", "production", "-e", "preview"];
    if (inspectResource(ctx) === null) {
      ctx.cli.vercel(
        [
          "integration",
          "add",
          "neon",
          "--name",
          ctx.opts.slug,
          "--meta",
          `region=${ctx.opts.region}`,
          "--meta",
          `auth=${ctx.opts.auth}`,
          "--billing-plan",
          "free_v3",
          ...environments,
          "--no-env-pull",
          "--scope",
          ctx.opts.scope,
        ],
        { cwd: ctx.appDir, inherit: true },
      );
    } else {
      ctx.cli.vercel(
        [
          "integration-resource",
          "connect",
          ctx.opts.slug,
          ctx.opts.slug,
          ...environments,
          "--yes",
          "--scope",
          ctx.opts.scope,
        ],
        { cwd: ctx.appDir },
      );
    }
    const project = findNeonProject(ctx);
    if (!project) throw new Error(`Created the Vercel resource "${ctx.opts.slug}" but can't find its Neon project.`);
    ctx.facts.neonProjectId = project.id;
    ctx.facts.neonOrgId = project.org_id;
  },
};

type Branch = { id: string; name: string; default?: boolean; primary?: boolean };

function productionBranch(ctx: Context): { name: string; id: string } {
  const projectId = ctx.facts.neonProjectId ?? "";
  const branches = parseJson<Branch[]>(
    ctx.cli.neon(["branches", "list", "--project-id", projectId, "--output", "json"]),
    "neon branches list",
  );
  const main = branches.find((b) => b.default ?? b.primary);
  if (!main) throw new Error(`Neon project ${projectId} has no default branch.`);
  return { name: main.name, id: main.id };
}

/** Pure: the new neon.project.json contents, keeping comments and branch names from the template. */
export function renderNeonProject(current: string, projectId: string, production: { name: string; id: string }) {
  const json = JSON.parse(current) as Record<string, unknown>;
  return `${JSON.stringify({ ...json, projectId, productionBranch: production }, null, 2)}\n`;
}

/** Pure: points the Neon MCP server in .mcp.json at the app's project. */
export function renderMcpJson(current: string, projectId: string) {
  return current.replace(/(mcp\.neon\.tech\/mcp\?projectId=)[a-z0-9-]+/, `$1${projectId}`);
}

export const neonFilesStep: Step = {
  id: "neon-files",
  title: "Point neon.project.json, .mcp.json and .neon at the new project",
  isDone(ctx) {
    const id = ctx.facts.neonProjectId ?? "";
    const project = JSON.parse(readFileSync(join(ctx.appDir, "neon.project.json"), "utf8")) as {
      projectId: string;
      productionBranch: { name: string; id: string };
    };
    const mcp = readFileSync(join(ctx.appDir, ".mcp.json"), "utf8");
    const done = project.projectId === id && mcp.includes(`projectId=${id}`) && existsSync(join(ctx.appDir, ".neon"));
    if (done) ctx.facts.productionBranch = project.productionBranch;
    return done;
  },
  run(ctx) {
    const id = ctx.facts.neonProjectId ?? "";
    const production = productionBranch(ctx);
    ctx.facts.productionBranch = production;
    const projectFile = join(ctx.appDir, "neon.project.json");
    writeFileSync(projectFile, renderNeonProject(readFileSync(projectFile, "utf8"), id, production));
    const mcpFile = join(ctx.appDir, ".mcp.json");
    writeFileSync(mcpFile, renderMcpJson(readFileSync(mcpFile, "utf8"), id));
    // Local Neon CLI context (gitignored): `neon` commands in the app default to its dev branch.
    writeFileSync(
      join(ctx.appDir, ".neon"),
      `${JSON.stringify({ orgId: ctx.facts.neonOrgId, projectId: id, branch: "dev" }, null, 2)}\n`,
    );
  },
};

/** Trusted origins for Neon Auth redirects: production and every preview URL of the Vercel team. */
export function trustedDomains(slug: string, scope: string): string[] {
  return [`https://${slug}.vercel.app`, `https://*-${scope}.vercel.app`];
}

function authArgs(ctx: Context) {
  return [
    "--project-id",
    ctx.facts.neonProjectId ?? "",
    "--branch",
    ctx.facts.productionBranch?.name ?? "main",
    "--output",
    "json",
  ];
}

function authState(ctx: Context) {
  const neon = (args: string[]) => ctx.cli.neon([...args, ...authArgs(ctx)]);
  let enabled = false;
  try {
    enabled = Boolean(parseJson<{ base_url?: string }>(neon(["neon-auth", "status"]), "neon-auth status").base_url);
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
  }
  if (!enabled) return { enabled, providers: new Set<string>(), domains: new Set<string>(), localhost: false };
  const providers = new Set(
    parseJson<{ id: string }[]>(neon(["neon-auth", "oauth-provider", "list"]), "oauth-provider list").map((p) => p.id),
  );
  const domains = new Set(
    parseJson<(string | { domain: string })[]>(neon(["neon-auth", "domain", "list"]), "domain list").map((d) =>
      typeof d === "string" ? d : d.domain,
    ),
  );
  const localhost = parseJson<{ allow_localhost: boolean }>(
    neon(["neon-auth", "domain", "allow-localhost", "get"]),
    "allow-localhost get",
  ).allow_localhost;
  return { enabled, providers, domains, localhost };
}

/**
 * Configures Neon Auth on the production branch BEFORE any other branch exists: branches copy
 * their parent's auth config. Localhost stays allowed because CI and `pnpm db:test` branch from
 * production and run the app on localhost.
 */
export const neonAuthStep: Step = {
  id: "neon-auth",
  title: "Neon Auth on production (providers, trusted domains)",
  skip: (ctx) => (ctx.opts.auth ? false : "no auth"),
  isDone(ctx) {
    const state = authState(ctx);
    return (
      state.enabled &&
      state.localhost &&
      ctx.opts.providers.every((p) => state.providers.has(p)) &&
      trustedDomains(ctx.opts.slug, ctx.opts.scope).every((d) => state.domains.has(d))
    );
  },
  run(ctx) {
    const neon = (args: string[]) => ctx.cli.neon([...args, ...authArgs(ctx)]);
    let state = authState(ctx);
    if (!state.enabled) {
      neon(["neon-auth", "enable"]);
      state = authState(ctx);
    }
    for (const provider of ctx.opts.providers) {
      if (!state.providers.has(provider)) neon(["neon-auth", "oauth-provider", "add", "--provider-id", provider]);
    }
    for (const domain of trustedDomains(ctx.opts.slug, ctx.opts.scope)) {
      if (!state.domains.has(domain)) neon(["neon-auth", "domain", "add", domain]);
    }
    if (!state.localhost) neon(["neon-auth", "domain", "allow-localhost", "enable"]);
  },
};

/** A Neon API key that can only touch this project, for CI's branch-per-run. */
export function createNeonApiKey(ctx: Context, name: string): string {
  const out = parseJson<{ key?: string }>(
    ctx.cli.neon([
      "api-keys",
      "create",
      "--name",
      name,
      "--project-id",
      ctx.facts.neonProjectId ?? "",
      "--output",
      "json",
    ]),
    "neon api-keys create",
  );
  if (!out.key) throw new Error("`neon api-keys create` returned no key.");
  return registerSecret(out.key);
}

/** Direct (unpooled) production URL, for migrate-prod.yml. */
export function productionDirectUrl(ctx: Context): string {
  const branch = ctx.facts.productionBranch?.name ?? "main";
  return registerSecret(ctx.cli.neon(["connection-string", branch, "--project-id", ctx.facts.neonProjectId ?? ""]));
}
