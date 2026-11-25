import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Cli, CliError, type RunOptions, redact, registerSecret } from "../../scripts/lib/cli";
import { type Context, runSteps, type Step } from "../../scripts/lib/provision/context";
import { REQUIRED_CHECKS } from "../../scripts/lib/provision/github";
import { renderMcpJson, renderNeonProject } from "../../scripts/lib/provision/neon";
import { parseProvisionArgs, titleFromSlug } from "../../scripts/lib/provision/options";
import { secretsStep } from "../../scripts/lib/provision/secrets";
import { renderTemplateConfig } from "../../scripts/lib/template-config";
import { deploymentOrigins } from "../../scripts/vercel-build";

describe("parseProvisionArgs", () => {
  it("fills defaults from the slug", () => {
    const opts = parseProvisionArgs(["my-app"], "/code/app-template");
    expect(opts).toMatchObject({
      slug: "my-app",
      name: "My App",
      description: "My App",
      visibility: "public",
      auth: true,
      providers: ["google"],
      dir: "/code/my-app",
      region: "iad1",
      pr: true,
      verify: true,
    });
  });

  it("drops providers when auth is removed, and accepts 'none'", () => {
    expect(parseProvisionArgs(["my-app", "--no-auth"]).providers).toEqual([]);
    expect(parseProvisionArgs(["my-app", "--providers", "none"]).providers).toEqual([]);
    expect(parseProvisionArgs(["my-app", "--providers", "google,github"]).providers).toEqual(["google", "github"]);
  });

  it("rejects bad input", () => {
    expect(() => parseProvisionArgs([])).toThrow(/exactly one/);
    expect(() => parseProvisionArgs(["My_App"])).toThrow(/lowercase/);
    expect(() => parseProvisionArgs(["app-template"])).toThrow(/template itself/);
    expect(() => parseProvisionArgs(["a", "--region", "us-east-1"])).toThrow(/--region/);
    expect(() => parseProvisionArgs(["a", "--providers", "apple"])).toThrow(/apple/);
    expect(() => parseProvisionArgs(["a", "--template", "nope"])).toThrow(/owner\/repo/);
  });

  it("titles slugs", () => {
    expect(titleFromSlug("habit-tracker-2")).toBe("Habit Tracker 2");
  });
});

describe("renderTemplateConfig", () => {
  const source = readFileSync("template.config.ts", "utf8");

  it("rewrites only the identity values", () => {
    const out = renderTemplateConfig(source, { name: 'Bob\'s "Notes"', slug: "bobs-notes", description: "Notes." });
    expect(out).toContain('  name: "Bob\'s \\"Notes\\"",');
    expect(out).toContain('  slug: "bobs-notes",');
    expect(out).toContain('  description: "Notes.",');
    expect(out).toContain('  locale: "en",');
    expect(out.split("\n").length).toBe(source.split("\n").length);
  });

  it("is idempotent", () => {
    const id = { name: "A", slug: "a", description: "B" };
    const once = renderTemplateConfig(source, id);
    expect(renderTemplateConfig(once, id)).toBe(once);
  });

  it("fails loudly when the shape changes", () => {
    expect(() => renderTemplateConfig("export const x = {};", { name: "a", slug: "a", description: "a" })).toThrow(
      /exactly one/,
    );
  });
});

describe("Neon files", () => {
  it("keeps comments and branch names in neon.project.json", () => {
    const out = JSON.parse(
      renderNeonProject(readFileSync("neon.project.json", "utf8"), "cool-river-12345678", { name: "main", id: "br-x" }),
    );
    expect(out).toMatchObject({
      projectId: "cool-river-12345678",
      productionBranch: { name: "main", id: "br-x" },
      devBranch: "dev",
      testBranch: "test",
    });
    expect(out.$comment).toBeTruthy();
  });

  it("points the Neon MCP at the new project", () => {
    const out = renderMcpJson(readFileSync(".mcp.json", "utf8"), "cool-river-12345678");
    expect(out).toContain("mcp.neon.tech/mcp?projectId=cool-river-12345678");
  });
});

describe("REQUIRED_CHECKS", () => {
  it("match the job names in ci.yml", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const names = [...ci.matchAll(/^ {4}name: (.+)$/gm)].map((m) => m[1]?.trim() ?? "");
    const variants =
      ci
        .match(/variant: \[(.+)\]/)?.[1]
        ?.split(",")
        .map((v) => v.trim()) ?? [];
    const matrix = /\$\{\{ matrix\.variant \}\}/;
    const jobs = names.flatMap((n) => (matrix.test(n) ? variants.map((v) => n.replace(matrix, v)) : [n]));
    expect([...jobs].sort()).toEqual([...REQUIRED_CHECKS].sort());
  });
});

describe("redaction", () => {
  it("masks Postgres passwords and registered secrets", () => {
    registerSecret("tok_supersecret_123");
    expect(redact("postgresql://u:p4ss@ep-x.neon.tech/db and tok_supersecret_123")).toBe(
      "postgresql://***@ep-x.neon.tech/db and ***",
    );
  });
});

const quietLog = { info: () => {}, warn: () => {} };

function fakeContext(cli: Cli): Context {
  return {
    opts: {
      ...parseProvisionArgs(["my-app"]),
      owner: "me",
      template: "me/app-template",
      scope: "team-x",
      teamId: "team_1",
    },
    cli,
    repo: "me/my-app",
    appDir: "/tmp/my-app",
    facts: {
      neonProjectId: "cool-river-12345678",
      productionBranch: { name: "main", id: "br-x" },
      vercelProjectId: "prj_1",
    },
    log: quietLog,
  };
}

describe("runSteps", () => {
  it("skips, reports finished steps as already done, and runs the rest in order", () => {
    const ran: string[] = [];
    const step = (id: string, done: boolean, skip?: string): Step => ({
      id,
      title: id,
      skip: () => skip ?? false,
      isDone: () => done,
      run: () => ran.push(id),
    });
    const outcomes = runSteps([step("a", true), step("b", false, "n/a"), step("c", false)], fakeContext({} as Cli));
    expect(outcomes.map((o) => o.status)).toEqual(["already", "skipped", "done"]);
    expect(ran).toEqual(["c"]);
  });

  it("stops at the first failure", () => {
    const ran: string[] = [];
    const steps: Step[] = [
      {
        id: "a",
        title: "a",
        isDone: () => false,
        run: () => {
          throw new Error("boom");
        },
      },
      { id: "b", title: "b", isDone: () => false, run: () => ran.push("b") },
    ];
    expect(() => runSteps(steps, fakeContext({} as Cli))).toThrow("boom");
    expect(ran).toEqual([]);
  });
});

describe("secretsStep", () => {
  type Call = { tool: string; args: string[]; options?: RunOptions };

  function recordingCli(existingRepoSecrets: string[]) {
    const calls: Call[] = [];
    const respond = (tool: string) => (args: string[], options?: RunOptions) => {
      calls.push({ tool, args, options });
      const cmd = args.join(" ");
      if (tool === "gh" && cmd.startsWith("secret list") && cmd.includes("--env production")) return "[]";
      if (tool === "gh" && cmd.startsWith("secret list"))
        return JSON.stringify(existingRepoSecrets.map((name) => ({ name })));
      if (tool === "gh" && cmd.startsWith("secret set")) return "";
      if (tool === "vercel" && cmd.startsWith("tokens create")) return JSON.stringify({ token: "vercel_tok_abcdefgh" });
      if (tool === "vercel" && cmd.startsWith("api /v9/projects/my-app")) {
        return JSON.stringify({
          id: "prj_1",
          protectionBypass: { bypass_secret_abcdefgh: { scope: "automation-bypass" } },
        });
      }
      if (tool === "neon" && cmd.startsWith("connection-string"))
        return "postgresql://u:pw_abcdefgh@ep-x.neon.tech/neondb";
      throw new CliError(`${tool} ${cmd}`, 1, "unexpected call in test");
    };
    const cli: Cli = {
      gh: respond("gh"),
      neon: respond("neon"),
      vercel: respond("vercel"),
      pnpm: respond("pnpm"),
      git: respond("git"),
    };
    return { cli, calls };
  }

  it("creates only the missing secrets, passing every value through stdin", () => {
    const { cli, calls } = recordingCli(["NEON_API_KEY"]);
    secretsStep.run(fakeContext(cli));

    const sets = calls.filter((c) => c.tool === "gh" && c.args[0] === "secret" && c.args[1] === "set");
    expect(sets.map((c) => c.args[2])).toEqual([
      "VERCEL_TOKEN",
      "VERCEL_AUTOMATION_BYPASS_SECRET",
      "PROD_DATABASE_URL_UNPOOLED",
    ]);
    expect(sets.map((c) => c.options?.input)).toEqual([
      "vercel_tok_abcdefgh",
      "bypass_secret_abcdefgh",
      "postgresql://u:pw_abcdefgh@ep-x.neon.tech/neondb",
    ]);
    expect(sets[2]?.args).toContain("production");
    expect(calls.some((c) => c.tool === "neon" && c.args[0] === "api-keys")).toBe(false);

    const secretValues = ["vercel_tok_abcdefgh", "bypass_secret_abcdefgh", "pw_abcdefgh"];
    for (const call of calls) {
      for (const value of secretValues) expect(call.args.join(" ")).not.toContain(value);
    }
  });
});

describe("deploymentOrigins (vercel-build)", () => {
  it("trusts a preview's deployment and branch URLs on its preview branch", () => {
    expect(
      deploymentOrigins(
        {
          VERCEL_ENV: "preview",
          VERCEL_GIT_COMMIT_REF: "feat/x",
          VERCEL_URL: "app-abc123-team.vercel.app",
          VERCEL_BRANCH_URL: "app-git-feat-x-team.vercel.app",
        },
        "main",
      ),
    ).toEqual({
      branch: "preview/feat/x",
      origins: ["https://app-abc123-team.vercel.app", "https://app-git-feat-x-team.vercel.app"],
    });
  });

  it("trusts the production domain on the production branch, and nothing outside Vercel", () => {
    expect(deploymentOrigins({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "app.com" }, "main")).toEqual({
      branch: "main",
      origins: ["https://app.com"],
    });
    expect(deploymentOrigins({}, "main")).toBeNull();
  });
});
