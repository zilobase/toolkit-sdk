import assert from "node:assert/strict";
import test from "node:test";

import { Toolkit, ToolkitError } from "../dist/index.js";

const descriptor = {
  id: "github.issue.create",
  connectorId: "github",
  name: "createGithubIssue",
  description: "Create an issue in a GitHub repository.",
  access: "write",
  annotations: {
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  },
  exposure: "core",
  presentation: {
    title: "Create GitHub issue",
    progressPhrases: ["Preparing the GitHub issue"],
  },
  requiredScopes: ["repo"],
  inputSchema: {
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"],
  },
};

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

test("queries normalized tool selections and revalidates cached catalogs", async () => {
  const requests = [];
  const toolkit = new Toolkit({
    apiKey: "project_key",
    fetch: async (_input, init) => {
      requests.push(init);
      if (init.headers["if-none-match"] === '"catalog_1"') {
        return new Response(null, { status: 304 });
      }
      return json(
        { catalogVersion: "catalog_1", items: [descriptor] },
        { headers: { etag: '"catalog_1"' } },
      );
    },
  });

  const first = await toolkit.tools.list("user_1");
  const second = await toolkit.tools.list("user_1");

  assert.equal(requests.length, 2);
  assert.deepEqual(JSON.parse(requests[0].body), {
    userId: "user_1",
    read: "all",
    write: [],
  });
  assert.equal(requests[0].headers["if-none-match"], undefined);
  assert.equal(requests[1].headers["if-none-match"], '"catalog_1"');
  assert.equal(second, first);
});

test("preserves explicit empty connector and account selections", async () => {
  let requestBody;
  const toolkit = new Toolkit({
    apiKey: "project_key",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(init.body);
      return json({ catalogVersion: "catalog_1", items: [] });
    },
  });

  await toolkit.tools.list("user_1", {
    connectors: [],
    connectedAccountIds: [],
  });

  assert.deepEqual(requestBody, {
    userId: "user_1",
    connectors: [],
    read: "all",
    write: [],
    connectedAccountIds: [],
  });
});

test("keeps catalog caches isolated by normalized selection", async () => {
  const conditionalHeaders = [];
  const toolkit = new Toolkit({
    apiKey: "project_key",
    fetch: async (_input, init) => {
      conditionalHeaders.push(init.headers["if-none-match"]);
      return json(
        { catalogVersion: "catalog_1", items: [] },
        { headers: { etag: '"catalog_1"' } },
      );
    },
  });

  await toolkit.tools.list("user_1", { connectors: ["github"] });
  await toolkit.tools.list("user_1", { connectors: ["gmail"] });

  assert.deepEqual(conditionalHeaders, [undefined, undefined]);
});

test("returns raw descriptors when no provider is configured", async () => {
  const toolkit = new Toolkit({
    apiKey: "project_key",
    fetch: async () =>
      json({ catalogVersion: "catalog_1", items: [descriptor] }),
  });

  const tools = await toolkit.tools.get("user_1", { connectors: ["github"] });

  assert.deepEqual(tools, [descriptor]);
});

test("converts descriptors through a provider and delegates execution", async () => {
  let context;
  let executionRequest;
  const provider = {
    createTools(value) {
      context = value;
      return { converted: value.tools.map((tool) => tool.id) };
    },
  };
  const toolkit = new Toolkit({
    apiKey: "project_key",
    provider,
    fetch: async (input, init) => {
      if (String(input).endsWith("/v1/tools/query")) {
        return json({ catalogVersion: "catalog_1", items: [descriptor] });
      }
      executionRequest = { url: String(input), init };
      return json({ result: { number: 42 } });
    },
  });

  const tools = await toolkit.tools.get("user_1", {
    connectedAccountIds: ["account_1"],
  });
  const result = await context.execute(
    "github.issue/create",
    { title: "Broken build" },
    "account_override",
  );

  assert.deepEqual(tools, { converted: ["github.issue.create"] });
  assert.equal(context.userId, "user_1");
  assert.deepEqual(context.connectedAccountIds, ["account_1"]);
  assert.deepEqual(context.tools, [descriptor]);
  assert.equal(
    executionRequest.url,
    "https://api.toolkit-sdk.dev/v1/tools/github.issue%2Fcreate/execute",
  );
  assert.deepEqual(JSON.parse(executionRequest.init.body), {
    userId: "user_1",
    arguments: { title: "Broken build" },
    connectedAccountId: "account_override",
  });
  assert.deepEqual(result, { number: 42 });
});

test("does not retry failed tool execution", async () => {
  let calls = 0;
  const toolkit = new Toolkit({
    apiKey: "project_key",
    fetch: async () => {
      calls += 1;
      return json(
        { error: { code: "UPSTREAM_ERROR", message: "Execution failed" } },
        { status: 502 },
      );
    },
  });

  await assert.rejects(
    toolkit.tools.execute("gmail.message.send", {
      userId: "user_1",
      arguments: { body: "hello" },
    }),
    (error) => error instanceof ToolkitError && error.code === "UPSTREAM_ERROR",
  );
  assert.equal(calls, 1);
});

test("searches tools and preserves discovery metadata", async () => {
  let request;
  const toolkit = new Toolkit({
    apiKey: "project_key",
    fetch: async (input, init) => {
      request = { url: String(input), init };
      return json({ items: [descriptor], nextCursor: "cursor_2" });
    },
  });

  const result = await toolkit.tools.search("open a bug report", {
    userId: "user_1",
    connectors: ["github"],
    limit: 5,
  });

  assert.equal(
    request.url,
    "https://api.toolkit-sdk.dev/v1/tools/search",
  );
  assert.deepEqual(JSON.parse(request.init.body), {
    query: "open a bug report",
    userId: "user_1",
    connectors: ["github"],
    limit: 5,
  });
  assert.equal(result.items[0].exposure, "core");
  assert.deepEqual(result.items[0].presentation, {
    title: "Create GitHub issue",
    progressPhrases: ["Preparing the GitHub issue"],
  });
});

test("rejects an unexpected empty catalog response", async () => {
  const toolkit = new Toolkit({
    apiKey: "project_key",
    fetch: async () => new Response(null, { status: 304 }),
  });

  await assert.rejects(toolkit.tools.list("user_1"), (error) => {
    assert.ok(error instanceof ToolkitError);
    assert.equal(error.code, "EMPTY_RESPONSE");
    assert.equal(error.status, 304);
    return true;
  });
});

test("provides exactly three router tools and delegates compact routing calls", async () => {
  let context;
  const requests = [];
  const toolkit = new Toolkit({
    apiKey: "project_key",
    provider: {
      createTools(value) {
        context = value;
        return Object.fromEntries(value.tools.map((tool) => [tool.id, tool]));
      },
    },
    fetch: async (input, init) => {
      requests.push({ body: JSON.parse(init.body), url: String(input) });
      return json({ items: [] });
    },
  });

  const tools = await toolkit.router.get("user_1");
  assert.deepEqual(Object.keys(tools), [
    "toolkit.router.search",
    "toolkit.router.schemas",
    "toolkit.router.execute",
  ]);
  await context.execute("toolkit.router.search", {
    query: "find calendar availability",
  });
  assert.equal(
    requests[0].url,
    "https://api.toolkit-sdk.dev/v1/tool-router/search",
  );
  assert.deepEqual(requests[0].body, {
    query: "find calendar availability",
    exposure: "core",
    limit: 6,
  });
});

test("limits router direct-tool preloads to 20", async () => {
  const toolkit = new Toolkit({ apiKey: "project_key", fetch: async () => json({ items: [] }) });
  await assert.rejects(
    toolkit.router.get("user_1", {
      preload: Array.from({ length: 21 }, (_, index) => `tool.${index}`),
    }),
    (error) =>
      error instanceof ToolkitError && error.code === "INVALID_TOOL_SELECTION",
  );
});
