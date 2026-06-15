#!/usr/bin/env node
// ─── PageLens CLI ────────────────────────────────────────────────────────────
// Usage:
//   PAGELENS_API_KEY=plk_live_... npx @pagelensai/cli scan https://example.com [--wait]
//
// Queues a PageLens AI scan via the public API and (with --wait) polls until
// it completes. The CLI prints the health score, compares against the previous
// scan, and can save the agent-ready Markdown repair pack for Codex, Cursor,
// Claude Code, Copilot, Windsurf, Lovable, Bolt, Replit, v0, or a developer.
// Exit code is non-zero on new critical/high findings so it can gate CI.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const VERSION = "0.1.7";
const API_BASE = (process.env.PAGELENS_API_BASE || "https://pagelensai.com").replace(/\/$/, "");
const API_KEY = process.env.PAGELENS_API_KEY;
const DEPTHS = ["HEALTH_WATCH", "LITE", "DEEP_AUDIT"];
const BUILDERS = [
  "lovable",
  "bolt",
  "replit",
  "v0",
  "cursor",
  "codex",
  "claude_code",
  "copilot",
  "windsurf",
  "shopify",
  "other",
];
const MOMENTS = ["public_post", "customer_data", "paid_traffic", "first_users"];
const ALLOWED_DEPTHS = new Set(DEPTHS);
const ALLOWED_BUILDERS = new Set(BUILDERS);
const ALLOWED_MOMENTS = new Set(MOMENTS);
const BUILDER_LABELS = {
  lovable: "Lovable",
  bolt: "Bolt",
  replit: "Replit",
  v0: "v0",
  cursor: "Cursor",
  codex: "Codex",
  claude_code: "Claude Code",
  copilot: "GitHub Copilot",
  windsurf: "Windsurf",
  shopify: "Shopify",
  other: "Other / not sure",
};
const MOMENT_LABELS = {
  public_post: "Post it publicly",
  customer_data: "Collect emails or payments",
  paid_traffic: "Run ads or outreach",
  first_users: "Onboard first users",
};
const KNOWN_OPTIONS = new Set([
  "--wait",
  "--timeout",
  "--depth",
  "--builder",
  "--ai-builder",
  "--moment",
  "--launch-moment",
  "--markdown",
  "--markdown-file",
  "--save-markdown",
  "--no-fail-on-regression",
]);

function fail(msg, code = 1) {
  console.error(`pagelens: ${msg}`);
  process.exit(code);
}

async function api(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function apiText(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${API_KEY}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return res.text();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function renderLaunchContext(builderPlatform, launchMoment) {
  return [
    builderPlatform
      ? `AI workflow: ${BUILDER_LABELS[builderPlatform] ?? builderPlatform}`
      : null,
    launchMoment
      ? `Launch moment: ${MOMENT_LABELS[launchMoment] ?? launchMoment}`
      : null,
  ].filter(Boolean).join(" | ");
}

function renderLaunchVerdict(result) {
  const verdict = result?.launchVerdict;
  if (!verdict) return null;
  return {
    status: verdict.status,
    label: verdict.label,
    headline: verdict.headline,
    summary: verdict.summary,
    nextStep: verdict.nextStep,
  };
}

async function saveMarkdown(path, markdown) {
  const dir = dirname(path);
  if (dir && dir !== ".") {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(path, markdown, "utf8");
}

const USAGE = `PageLens CLI v${VERSION}

Scan -> save Markdown -> fix with your AI agent -> re-scan for proof.

Usage:
  pagelens scan <url> [--wait] [--timeout <seconds>] [--depth HEALTH_WATCH|LITE|DEEP_AUDIT]
                       [--builder <value>] [--moment <value>] [--markdown <file>]

Environment:
  PAGELENS_API_KEY   API key (plk_live_...). Required on Pro+ automation.
                     Create one at <app>/settings/integrations.
  PAGELENS_API_BASE  Override the API host (default https://pagelensai.com).

Options:
  --wait             Poll until the scan completes and print the score, owner verdict, and diff.
  --timeout <sec>    Maximum wait time when --wait is set (default 900).
  --depth <level>    HEALTH_WATCH (default), LITE, or DEEP_AUDIT.
  --builder <value>  AI workflow context: ${BUILDERS.join("|")}.
  --moment <value>   Launch context: ${MOMENTS.join("|")}.
  --markdown <file>  With --wait, save the agent-ready Markdown report; parent dirs are created.
  --no-fail-on-regression
                     Do not exit 3 for new critical/high findings.
  -h, --help         Show this help.
  -v, --version      Print the CLI version.

Agent repair loop:
  pagelens scan https://example.com --wait --builder codex --moment public_post --markdown reports/pagelens.md
  Paste the Markdown into Codex, Cursor, Claude Code, Copilot, Windsurf, Lovable,
  Bolt, Replit, v0, or your developer. After the fixes ship, run the command
  again to prove what improved or regressed.

Exit codes: 0 ok · 1 usage/error · 2 timed out waiting · 3 new critical/high findings`;

function optionValue(args, names) {
  for (let i = 0; i < args.length; i += 1) {
    for (const name of names) {
      if (args[i] === name) {
        const value = args[i + 1];
        if (!value || value.startsWith("--")) fail(`${name} requires a value`);
        return value;
      }
      const prefix = `${name}=`;
      if (args[i].startsWith(prefix)) {
        const value = args[i].slice(prefix.length).trim();
        if (!value) fail(`${name} requires a value`);
        return value;
      }
    }
  }
  return undefined;
}

function assertKnownOptions(args) {
  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const name = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (!KNOWN_OPTIONS.has(name)) {
      fail(`unknown option ${name}. Run "pagelens --help" for usage`);
    }
  }
}

async function main() {
  const [, , cmd, url, ...rest] = process.argv;

  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(USAGE);
    return;
  }
  if (cmd !== "scan" || !url) {
    console.log(USAGE);
    process.exit(1);
  }

  assertKnownOptions(rest);
  const wait = rest.includes("--wait");
  const failOnRegression = !rest.includes("--no-fail-on-regression");
  const analysisDepth = optionValue(rest, ["--depth"]);
  if (analysisDepth && !ALLOWED_DEPTHS.has(analysisDepth)) {
    fail(`--depth must be one of ${DEPTHS.join(", ")}`);
  }
  const builderPlatform = optionValue(rest, ["--builder", "--ai-builder"]);
  if (builderPlatform && !ALLOWED_BUILDERS.has(builderPlatform)) {
    fail(`--builder must be one of ${BUILDERS.join(", ")}`);
  }
  const launchMoment = optionValue(rest, ["--moment", "--launch-moment"]);
  if (launchMoment && !ALLOWED_MOMENTS.has(launchMoment)) {
    fail(`--moment must be one of ${MOMENTS.join(", ")}`);
  }
  const markdownFile = optionValue(rest, [
    "--markdown",
    "--markdown-file",
    "--save-markdown",
  ]);
  if (markdownFile && !wait) {
    fail("--markdown requires --wait so the report is complete before download");
  }
  const timeoutValue = optionValue(rest, ["--timeout"]);
  const timeoutSeconds = timeoutValue ? Number.parseInt(timeoutValue, 10) : 900;
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    fail("--timeout must be a positive number of seconds");
  }
  if (!API_KEY) fail("PAGELENS_API_KEY env var is required");

  const created = await api("/api/v1/scans", {
    method: "POST",
    body: JSON.stringify({
      url,
      ...(analysisDepth ? { analysisDepth } : {}),
      ...(builderPlatform ? { builderPlatform } : {}),
      ...(launchMoment ? { launchMoment } : {}),
    }),
  });
  console.log(`✓ Scan queued: ${created.scanId}`);
  if (builderPlatform || launchMoment) {
    console.log(`  Launch context: ${renderLaunchContext(builderPlatform, launchMoment)}`);
  }
  console.log(`  Report: ${created.reportUrl}`);
  console.log(`  API result: ${created.resultUrl}`);
  if (created.markdownUrl) {
    console.log(`  Markdown API: ${created.markdownUrl}`);
  }

  if (!wait) return;

  process.stdout.write("  Waiting for completion");
  const deadline = Date.now() + timeoutSeconds * 1000;
  let result;
  while (Date.now() < deadline) {
    await sleep(10_000);
    process.stdout.write(".");
    result = await api(`/api/v1/scans/${created.scanId}`);
    if (result.status === "COMPLETE" || result.status === "FAILED") break;
  }
  process.stdout.write("\n");

  if (!result || result.status !== "COMPLETE") {
    fail(`scan did not complete in time (status: ${result?.status ?? "unknown"})`, 2);
  }

  console.log(`\nHealth score: ${result.score ?? "n/a"}/100`);
  const launchVerdict = renderLaunchVerdict(result);
  if (launchVerdict) {
    console.log(`Owner verdict: ${launchVerdict.label}`);
    console.log(`  ${launchVerdict.headline}`);
    console.log(`  ${launchVerdict.nextStep}`);
  }
  if (result.markdownUrl) {
    console.log(`Markdown API: ${result.markdownUrl}`);
  }
  if (markdownFile) {
    const markdown = await apiText(`/api/v1/scans/${created.scanId}/markdown`);
    await saveMarkdown(markdownFile, markdown);
    console.log(`Markdown saved: ${markdownFile}`);
  }
  if (result.diff) {
    const { added, resolved, persisting } = result.diff;
    console.log(`Changes vs last scan: +${added} new, -${resolved} resolved, ${persisting} persisting`);
    for (const f of result.diff.addedFindings || []) {
      console.log(`  • [${f.severity}] ${f.title} (${f.pageUrl})`);
    }
    const regressions = (result.diff.addedFindings || []).filter(
      (f) => f.severity === "CRITICAL" || f.severity === "HIGH",
    );
    if (failOnRegression && regressions.length > 0) {
      fail(`${regressions.length} new critical/high finding(s)`, 3);
    }
  }
}

main().catch((err) => fail(err.message));
