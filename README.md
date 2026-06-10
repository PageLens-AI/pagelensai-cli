# @pagelensai/cli

Run [PageLens AI](https://pagelensai.com) launch reviews from your terminal, CI, and deploy flow. The CLI is the developer automation path for teams that want PageLens AI to check an AI-built site every time it ships, not just when someone remembers to open the dashboard.

PageLens AI has two launch paths:

- **Launch Pack** - for founders and AI builders who want owner-first findings, AI-builder fix prompts, a Markdown export, and a re-scan before showing the site to customers.
- **Solo+ automation** - for developers, agencies, and technical operators who want API keys, CLI scans, GitHub Actions, and deploy hooks in the release workflow.

Use this package for the second path. For nontechnical repair loops, start with the Launch Pack in the web app and paste the fix prompts into Lovable, Bolt, Replit, Cursor, Codex, Claude, Copilot, or Windsurf.

## Install

No install needed — run it with `npx`:

```bash
npx @pagelensai/cli scan https://example.com
```

Or install it globally (the binary is named `pagelens`):

```bash
npm i -g @pagelensai/cli
pagelens scan https://example.com
```

## Authentication

Create an API key at **Settings -> Integrations -> Developer access** (format `plk_live_...`) and expose it as an environment variable. API keys are available on **Solo, Pro, and Agency** plans.

```bash
export PAGELENS_API_KEY=plk_live_xxxxxxxxxxxxxxxxxxxxx
```

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PAGELENS_API_KEY` | Yes | - | Your API key. |
| `PAGELENS_API_BASE` | No | `https://pagelensai.com` | Override the API host (self-hosted / staging). |

## Usage

```bash
pagelens scan <url> [--wait] [--timeout <seconds>] [--depth HEALTH_WATCH|LITE|DEEP_AUDIT] [--builder <value>] [--moment <value>]
```

| Option | Description |
| --- | --- |
| `--wait` | Poll until the scan completes, then print the health score and the change diff vs the previous scan. |
| `--timeout <seconds>` | Maximum wait time when `--wait` is set. Defaults to `900` seconds. |
| `--depth <level>` | Scan depth: `HEALTH_WATCH` (default, ~0 AI cost), `LITE`, or `DEEP_AUDIT`. |
| `--builder <value>` | Optional AI-workflow context for report/prompt framing: `lovable`, `bolt`, `replit`, `v0`, `cursor`, `codex`, `claude_code`, `copilot`, `windsurf`, `shopify`, or `other`. |
| `--moment <value>` | Optional launch context: `public_post`, `customer_data`, `paid_traffic`, or `first_users`. |
| `--no-fail-on-regression` | Keep exit code `0` even when new critical/high findings appear. |
| `-h, --help` | Show help. |
| `-v, --version` | Print the CLI version. |

### Examples

```bash
# Fire-and-forget: queue a scan and print the report URL
pagelens scan https://example.com

# Block until complete and fail the step on new critical/high findings
pagelens scan https://example.com --wait

# Wait up to 20 minutes, but report regressions without failing the job
pagelens scan https://example.com --wait --timeout 1200 --no-fail-on-regression

# Deeper AI audit
pagelens scan https://example.com --wait --depth DEEP_AUDIT

# Deep audit framed for a Codex-built launch before a public post
pagelens scan https://example.com --wait --depth DEEP_AUDIT --builder codex --moment public_post
```

`--builder` and `--moment` do not change scoring, crawl coverage, or severity.
They tell PageLens how to frame summaries and fix prompts so the same evidence
works for a coding agent and for the site owner who is deciding whether it is
safe to launch.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | Usage error or API error. |
| `2` | `--wait` timed out before the scan completed. |
| `3` | Scan completed with **new** critical/high findings vs the previous scan. |

## Use in CI (GitHub Actions)

CLI step:

```yaml
- name: PageLens scan
  run: npx @pagelensai/cli scan https://staging.example.com --wait
  env:
    PAGELENS_API_KEY: ${{ secrets.PAGELENS_API_KEY }}
```

First-class action:

```yaml
- uses: PageLens-AI/page-lens-ai/integrations/github-action@main
  with:
    api-key: ${{ secrets.PAGELENS_API_KEY }}
    url: https://staging.example.com
    analysis-depth: HEALTH_WATCH
    wait: "true"
    timeout-seconds: "900"
```

The step fails (exit `3`) if the deploy introduced a new critical/high issue, blocking the merge/release.

For production workflows, pin the action to a release tag once your chosen tag exists instead of relying on a moving branch. The `@main` example is useful while integrating or testing the action.

## CLI, MCP, or Launch Pack?

| Need | Use |
| --- | --- |
| "I built this with AI and need to know what to fix before launch." | Launch Pack |
| "I want my AI assistant to read the report and help patch findings." | MCP |
| "I want every deploy or release to run a repeatable scan." | CLI/API/deploy hooks |

MCP reads and works with report data through OAuth. The CLI creates scans from trusted automation through API keys. Launch Pack is the one-off paid repair loop for serious builders who are about to post, launch, collect customer data, run ads, or onboard users.

## Links

- Website: https://pagelensai.com
- Source: https://github.com/PageLens-AI/pagelensai-cli
- Pricing: https://pagelensai.com/pricing
- MCP docs: https://pagelensai.com/mcp
- CLI docs: https://pagelensai.com/cli
- Manage API keys & deploy hooks: https://pagelensai.com/settings/integrations
- Support: https://pagelensai.com/support
