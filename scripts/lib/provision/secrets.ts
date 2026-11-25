/**
 * GitHub Actions variables and secrets (docs/template-contract.md §5). Each secret is created only
 * when missing, read straight from the CLI that owns it and piped into `gh secret set` via stdin.
 * Nothing is printed and nothing is asked of the user.
 */
import { ACTIONS_CREDENTIAL_NAME, BUILDS_CREDENTIAL_NAME, type Context, type Step } from "./context";
import { listSecrets, listVariables, setSecret, setVariable } from "./github";
import { createNeonApiKey, productionDirectUrl } from "./neon";
import { ensureBypassSecret, ensureDeployHook, envTargets } from "./vercel";

function wantedVariables(ctx: Context): Record<string, string> {
  return {
    NEON_PROJECT_ID: ctx.facts.neonProjectId ?? "",
    VERCEL_ORG_ID: ctx.facts.vercelOrgId ?? "",
    VERCEL_PROJECT_ID: ctx.facts.vercelProjectId ?? "",
  };
}

export const variablesStep: Step = {
  id: "github-variables",
  title: "GitHub variables (NEON_PROJECT_ID, VERCEL_ORG_ID, VERCEL_PROJECT_ID)",
  isDone(ctx) {
    const current = listVariables(ctx);
    return Object.entries(wantedVariables(ctx)).every(([name, value]) => current.get(name) === value);
  },
  run(ctx) {
    const current = listVariables(ctx);
    for (const [name, value] of Object.entries(wantedVariables(ctx))) {
      if (!value) throw new Error(`Missing a value for ${name}; an earlier step didn't record it.`);
      if (current.get(name) !== value) setVariable(ctx, name, value);
    }
  },
};

type SecretSpec = { name: string; environment?: string; value(ctx: Context): string };

export const SECRETS: SecretSpec[] = [
  { name: "NEON_API_KEY", value: (ctx) => createNeonApiKey(ctx, ACTIONS_CREDENTIAL_NAME(ctx.opts.slug)) },
  { name: "VERCEL_DEPLOY_HOOK_URL", environment: "production", value: ensureDeployHook },
  { name: "VERCEL_AUTOMATION_BYPASS_SECRET", value: ensureBypassSecret },
  { name: "PROD_DATABASE_URL_UNPOOLED", environment: "production", value: productionDirectUrl },
];

function missingSecrets(ctx: Context): SecretSpec[] {
  const repo = listSecrets(ctx);
  const production = listSecrets(ctx, "production");
  return SECRETS.filter((s) => !(s.environment === "production" ? production : repo).has(s.name));
}

export const secretsStep: Step = {
  id: "github-secrets",
  title: "GitHub secrets (Neon API key, deploy hook, bypass secret, production DB URL)",
  isDone: (ctx) => missingSecrets(ctx).length === 0,
  run(ctx) {
    for (const spec of missingSecrets(ctx)) setSecret(ctx, spec.name, spec.value(ctx), spec.environment);
  },
};

const BUILD_TARGETS = ["production", "preview"] as const;

/**
 * NEON_API_KEY on Vercel (production + preview, sensitive): a key scoped to this Neon project that
 * `pnpm vercel-build` uses to trust each deployment's URL in its branch's Neon Auth.
 */
export const vercelBuildKeyStep: Step = {
  id: "vercel-build-key",
  title: "NEON_API_KEY on Vercel (builds trust their own URL in Neon Auth)",
  skip: (ctx) => (ctx.opts.auth ? false : "no auth"),
  isDone: (ctx) => {
    const targets = envTargets(ctx).get("NEON_API_KEY");
    return BUILD_TARGETS.every((t) => targets?.has(t));
  },
  run(ctx) {
    const existing = envTargets(ctx).get("NEON_API_KEY");
    const key = createNeonApiKey(ctx, BUILDS_CREDENTIAL_NAME(ctx.opts.slug));
    for (const target of BUILD_TARGETS) {
      if (existing?.has(target)) continue;
      ctx.cli.vercel(["env", "add", "NEON_API_KEY", "-e", target, "--sensitive", "--yes"], {
        cwd: ctx.appDir,
        input: key,
      });
    }
  },
};
