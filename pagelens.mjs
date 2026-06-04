#!/usr/bin/env node
// ─── PageLens CLI ────────────────────────────────────────────────────────────
// Usage:
//   PAGELENS_API_KEY=plk_live_… npx @pagelensai/cli scan https://example.com [--wait]
//
// Queues a Health Watch scan via the public API and (with --wait) polls until
// it completes, printing the health score and the change diff vs the previous
// scan. Exit code is non-zero on new critical/high findings so it can gate CI.

const VERSION = "0.1.0";
const API_BASE = (process.env.PAGELENS_API_BASE || "https://pagelensai.com").replace(/\/$/, "");
const API_KEY = process.env.PAGELENS_API_KEY;
const ALLOWED_DEPTHS = new Set(["HEALTH_WATCH", "LITE", "DEEP_AUDIT"]);

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const USAGE = `PageLens CLI v${VERSION}

Usage:
  pagelens scan <url> [--wait] [--timeout <seconds>] [--depth HEALTH_WATCH|LITE|DEEP_AUDIT]

Environment:
  PAGELENS_API_KEY   API key (plk_live_…). Required. Create one at
                     <app>/settings/integrations.
  PAGELENS_API_BASE  Override the API host (default https://pagelensai.com).

Options:
  --wait             Poll until the scan completes and print the score + diff.
  --timeout <sec>    Maximum wait time when --wait is set (default 900).
  --depth <level>    HEALTH_WATCH (default), LITE, or DEEP_AUDIT.
  --no-fail-on-regression
                     Do not exit 3 for new critical/high findings.
  -h, --help         Show this help.
  -v, --version      Print the CLI version.

Exit codes: 0 ok · 1 usage/error · 2 timed out waiting · 3 new critical/high findings`;

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
  if (!API_KEY) fail("PAGELENS_API_KEY env var is required");

  const wait = rest.includes("--wait");
  const failOnRegression = !rest.includes("--no-fail-on-regression");
  const depthIdx = rest.indexOf("--depth");
  const analysisDepth = depthIdx >= 0 ? rest[depthIdx + 1] : undefined;
  if (depthIdx >= 0 && !ALLOWED_DEPTHS.has(analysisDepth)) {
    fail(`--depth must be one of ${[...ALLOWED_DEPTHS].join(", ")}`);
  }
  const timeoutIdx = rest.indexOf("--timeout");
  const timeoutSeconds =
    timeoutIdx >= 0 ? Number.parseInt(rest[timeoutIdx + 1] ?? "", 10) : 900;
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    fail("--timeout must be a positive number of seconds");
  }

  const created = await api("/api/v1/scans", {
    method: "POST",
    body: JSON.stringify({ url, ...(analysisDepth ? { analysisDepth } : {}) }),
  });
  console.log(`✓ Scan queued: ${created.scanId}`);
  console.log(`  Report: ${created.reportUrl}`);
  console.log(`  API result: ${created.resultUrl}`);

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
