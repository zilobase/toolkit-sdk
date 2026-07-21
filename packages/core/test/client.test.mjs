import assert from "node:assert/strict";
import test from "node:test";

import { Toolkit, ToolkitError } from "../dist/index.js";

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

test("validates Toolkit constructor options", () => {
  assert.throws(
    () => new Toolkit({ apiKey: "  " }),
    (error) => error instanceof ToolkitError && error.code === "INVALID_API_KEY",
  );
  assert.throws(
    () => new Toolkit({ apiKey: "secret", timeoutMs: 0 }),
    (error) => error instanceof ToolkitError && error.code === "INVALID_TIMEOUT",
  );
  assert.throws(
    () => new Toolkit({ apiKey: "secret", timeoutMs: Number.POSITIVE_INFINITY }),
    (error) => error instanceof ToolkitError && error.code === "INVALID_TIMEOUT",
  );
  assert.throws(
    () => new Toolkit({ apiKey: "secret", baseUrl: "/api/toolkit" }),
    (error) => error instanceof ToolkitError && error.code === "INVALID_BASE_URL",
  );
  assert.throws(
    () => new Toolkit({ apiKey: "secret", baseUrl: "ftp://localhost:3100" }),
    (error) => error instanceof ToolkitError && error.code === "INVALID_BASE_URL",
  );
});

test("lists connectors with pagination against the live Toolkit API", async () => {
  let captured;
  const toolkit = new Toolkit({
    apiKey: "project_key",
    fetch: async (input, init) => {
      captured = { input: String(input), init };
      return json({ items: [], nextCursor: "cursor_2" });
    },
  });

  const result = await toolkit.connectors.list({ cursor: "cursor 1", limit: 25 });

  assert.deepEqual(result, { items: [], nextCursor: "cursor_2" });
  assert.equal(
    captured.input,
    "https://api.toolkit-sdk.dev/v1/connectors?cursor=cursor+1&limit=25",
  );
  assert.equal(captured.init.headers.authorization, "Bearer project_key");
});

test("uses the hosted API URL by default", async () => {
  let requestUrl;
  const toolkit = new Toolkit({
    apiKey: "project_key",
    fetch: async (input) => {
      requestUrl = String(input);
      return json({ items: [] });
    },
  });

  await toolkit.connectors.list();

  assert.equal(
    requestUrl,
    "https://api.toolkit-sdk.dev/v1/connectors",
  );
});

test("supports a normalized local API URL override", async () => {
  let requestUrl;
  const toolkit = new Toolkit({
    apiKey: "project_key",
    baseUrl: "http://localhost:3100///",
    fetch: async (input) => {
      requestUrl = String(input);
      return json({ items: [] });
    },
  });

  await toolkit.connectors.list();

  assert.equal(requestUrl, "http://localhost:3100/v1/connectors");
});

test("gets connectors using an encoded identifier", async () => {
  let requestUrl;
  const connector = {
    id: "github/apps",
    name: "GitHub Apps",
    description: "GitHub App connections",
    authMethods: ["oauth2"],
  };
  const toolkit = new Toolkit({
    apiKey: "project_key",
    fetch: async (input) => {
      requestUrl = String(input);
      return json(connector);
    },
  });

  const result = await toolkit.connectors.get("github/apps");

  assert.deepEqual(result, connector);
  assert.equal(
    requestUrl,
    "https://api.toolkit-sdk.dev/v1/connectors/github%2Fapps",
  );
});

test("returns structured errors from connector requests", async () => {
  const toolkit = new Toolkit({
    apiKey: "project_key",
    fetch: async () =>
      json(
        { error: { code: "NOT_FOUND", message: "Connector not found" } },
        { status: 404, headers: { "x-request-id": "req_connector" } },
      ),
  });

  await assert.rejects(toolkit.connectors.get("missing"), (error) => {
    assert.ok(error instanceof ToolkitError);
    assert.equal(error.code, "NOT_FOUND");
    assert.equal(error.status, 404);
    assert.equal(error.requestId, "req_connector");
    return true;
  });
});

test("browser entrypoint rejects server-only client construction", async () => {
  const browser = await import("../dist/browser.js");

  assert.throws(
    () => new browser.Toolkit(),
    /cannot run in browser JavaScript/,
  );
  assert.equal(browser.ToolkitError, ToolkitError);
});
