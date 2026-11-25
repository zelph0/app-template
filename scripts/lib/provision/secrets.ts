/**
 * GitHub Actions variables and secrets (docs/template-contract.md §5). Each secret is created only
 * when missing, read straight from the CLI that owns it and piped into `gh secret set` via stdin.
 * Nothing is printed and nothing is asked of the user.
 */
import { ACTIONS_CREDENTIAL_NAME, type Context, type Step } from "./context";
import { listSecrets, listVariables, setSecret, setVariable } from "./github";
import { createNeonApiKey, productionDirectUrl } from "./neon";
import { createVercelToken, ensureBypassSecret } from "./vercel";

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
  { name: "VERCEL_TOKEN", value: (ctx) => createVercelToken(ctx, ACTIONS_CREDENTIAL_NAME(ctx.opts.slug)) },
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
  title: "GitHub secrets (Neon API key, Vercel token, bypass secret, production DB URL)",
  isDone: (ctx) => missingSecrets(ctx).length === 0,
  run(ctx) {
    for (const spec of missingSecrets(ctx)) setSecret(ctx, spec.name, spec.value(ctx), spec.environment);
  },
};
