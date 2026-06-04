# @pagelensai/cli

Queue [PageLens AI](https://pagelensai.com) website health scans from your terminal or CI. Great for gating deploys: the CLI exits non-zero when a scan introduces new critical/high findings.

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

Create an API key at **<your app>/settings/integrations** (format `plk_live_…`) and expose it as an environment variable:

```bash
export PAGELENS_API_KEY=plk_live_xxxxxxxxxxxxxxxxxxxxx
```

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PAGELENS_API_KEY` | Yes | — | Your API key. |
| `PAGELENS_API_BASE` | No | `https://pagelensai.com` | Override the API host (self-hosted / staging). |

## Usage

```bash
pagelens scan <url> [--wait] [--timeout <seconds>] [--depth HEALTH_WATCH|LITE|DEEP_AUDIT]
```

| Option | Description |
| --- | --- |
| `--wait` | Poll until the scan completes, then print the health score and the change diff vs the previous scan. |
| `--timeout <seconds>` | Maximum wait time when `--wait` is set. Defaults to `900` seconds. |
| `--depth <level>` | Scan depth: `HEALTH_WATCH` (default, ~0 AI cost), `LITE`, or `DEEP_AUDIT`. |
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
```

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

## Links

- Website: https://pagelensai.com
- Source: https://github.com/PageLens-AI/pagelensai-cli
- Manage API keys & deploy hooks: `/settings/integrations`
- Support: https://pagelensai.com/support
