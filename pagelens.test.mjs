import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import test from "node:test";

async function withApi(handler, action) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { return await action(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((done) => server.close(done)); }
}

async function cli(args, base) {
  const child = spawn(process.execPath, [join(import.meta.dirname, "pagelens.mjs"), ...args], {
    env: { ...process.env, PAGELENS_API_BASE: base, PAGELENS_API_KEY: "plk_live_test" },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const [code] = await once(child, "close");
  return { code, stdout, stderr };
}

test("reviews lists only the requested product workspace through bearer API", async () => {
  let requestPath = "";
  let authorization = "";
  await withApi((request, response) => {
    requestPath = request.url;
    authorization = request.headers.authorization;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ analyses: [{ id: "run-1", templateKey: "AD_LANDING",
      status: "COMPLETE", workspaceSlug: "acme", createdAt: "2026-09-20T12:00:00Z" }] }));
  }, async (base) => {
    const result = await cli(["reviews", "--workspace", "acme", "--limit", "1"], base);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /AD_LANDING.*acme.*run-1/);
  });
  assert.equal(requestPath, "/api/v1/product-analyses?limit=1&workspace=acme");
  assert.equal(authorization, "Bearer plk_live_test");
});

test("review exports the server Markdown only after a complete report", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pagelens-cli-test-"));
  const file = join(directory, "connected.md");
  try {
    await withApi((request, response) => {
      if (request.url.endsWith("/markdown")) {
        response.setHeader("content-type", "text/markdown");
        response.end("# Source-linked review\n");
        return;
      }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ id: "run-1", template: { key: "OFFER_CONSISTENCY" },
        status: "COMPLETE", market: "GB", verdict: "NO_CHANGE",
        noChangeReason: "Both offers agree.", improvements: [], limitations: [],
        actions: { reportUrl: "/workspaces/acme/reviews/run-1", exportUrl: "/export" } }));
    }, async (base) => {
      const result = await cli(["review", "run-1", "--markdown", file], base);
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Both offers agree/);
      assert.equal(await readFile(file, "utf8"), "# Source-linked review\n");
    });
  } finally {
    const absolute = resolve(directory);
    if (!absolute.startsWith(resolve(tmpdir()) + sep)) throw new Error("Unexpected test directory");
    await rm(absolute, { recursive: true, force: true });
  }
});
