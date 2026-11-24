/**
 * Vercel build command (vercel.json). Previews: migrate + seed the PR's own Neon branch
 * (injected by the Neon <> Vercel integration), so preview e2e has data and users.
 * Production: never migrates here. .github/workflows/migrate-prod.yml already applied
 * migrations before triggering this deploy.
 */
import { execFileSync } from "node:child_process";

const run = (args: string[]) => execFileSync("pnpm", args, { stdio: "inherit" });
const env = process.env.VERCEL_ENV;

run(["exec", "prisma", "generate"]);
if (env === "preview") {
  console.info("Preview: applying migrations and seeding the preview branch…");
  run(["exec", "prisma", "migrate", "deploy"]);
  run(["exec", "prisma", "db", "seed"]);
}
run(["exec", "next", "build"]);
