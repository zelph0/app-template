/**
 * Vercel build command (vercel.json). Previews: migrate + seed the PR's own Neon branch
 * (injected by the Neon <> Vercel integration), so preview e2e has data and users.
 * Production: never migrates here. .github/workflows/migrate-prod.yml already applied
 * migrations before triggering this deploy.
 *
 * Both: trust this deployment's URLs in its branch's Neon Auth. Neon Auth rejects sign-ins from
 * an Origin that isn't on the branch's trusted-domain list (INVALID_ORIGIN), each preview branch
 * has its own list, and Vercel's preview hostnames can't be matched by a wildcard
 * (docs/decisions/0009). Needs NEON_API_KEY (project-scoped, set by `pnpm provision`) and
 * NEON_PROJECT_ID (set by the integration); skipped when either is missing or auth is removed.
 */
import { execFileSync } from "node:child_process";
import { neonCli, neonJson, readNeonProject } from "./lib/neon";

const run = (args: string[]) => execFileSync("pnpm", args, { stdio: "inherit" });
const env = process.env.VERCEL_ENV;

/** The Neon branch and the https origins this deployment serves, or null outside Vercel. */
export function deploymentOrigins(vars: Record<string, string | undefined>, productionBranch: string) {
  const https = (hosts: (string | undefined)[]) => [...new Set(hosts.filter(Boolean).map((h) => `https://${h}`))];
  if (vars.VERCEL_ENV === "preview" && vars.VERCEL_GIT_COMMIT_REF) {
    return {
      branch: `preview/${vars.VERCEL_GIT_COMMIT_REF}`,
      origins: https([vars.VERCEL_URL, vars.VERCEL_BRANCH_URL]),
    };
  }
  if (vars.VERCEL_ENV === "production") {
    return { branch: productionBranch, origins: https([vars.VERCEL_PROJECT_PRODUCTION_URL]) };
  }
  return null;
}

function trustDeploymentOrigins() {
  if (!process.env.NEON_AUTH_BASE_URL) return; // auth module removed, or auth not configured
  const projectId = process.env.NEON_PROJECT_ID;
  if (!projectId || !process.env.NEON_API_KEY) {
    console.warn("Neon Auth: NEON_PROJECT_ID / NEON_API_KEY not set; not trusting this deployment's URL.");
    return;
  }
  const target = deploymentOrigins(process.env, readNeonProject().productionBranch.name);
  if (!target) return;
  const base = ["--project-id", projectId, "--branch", target.branch];
  const listed = neonJson<(string | { domain: string })[]>(["neon-auth", "domain", "list", ...base]);
  const trusted = new Set(listed.map((d) => (typeof d === "string" ? d : d.domain)));
  for (const origin of target.origins.filter((o) => !trusted.has(o))) {
    neonCli(["neon-auth", "domain", "add", origin, ...base]);
    console.info(`Neon Auth: trusted ${origin} on ${target.branch}`);
  }
}

const isMain = process.argv[1]?.endsWith("scripts/vercel-build.ts");
if (isMain) {
  run(["exec", "prisma", "generate"]);
  if (env === "preview") {
    console.info("Preview: applying migrations and seeding the preview branch…");
    run(["exec", "prisma", "migrate", "deploy"]);
    run(["exec", "prisma", "db", "seed"]);
  }
  trustDeploymentOrigins();
  run(["exec", "next", "build"]);
}
