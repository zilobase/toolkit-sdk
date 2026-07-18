import assert from "node:assert/strict";
import test from "node:test";

import { ConnectionRequest, Toolkit, ToolkitError } from "../dist/index.js";

const account = {
  id: "64cbaf8a-0cd4-4acf-90e5-a2319c401fe7",
  userId: "user_1",
  connectorId: "gmail",
  status: "active",
  isDefault: true,
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
};

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function pendingRequest(overrides = {}) {
  return {
    id: "aa5e266d-22de-4198-9b2d-b43034bfe46a",
    redirectUrl: "https://accounts.example.com/oauth",
    status: "pending",
    expiresAt: new Date(Date.now() + 5_000).toISOString(),
    ...overrides,
  };
}

test("creates authorization requests with stable access defaults", async () => {
  let captured;
  const toolkit = new Toolkit({
    apiKey: "project_key",
    fetch: async (input, init) => {
      captured = { input: String(input), init };
      return json(pendingRequest(), { status: 201 });
    },
  });

  const request = await toolkit.connectors.authorize("user_1", "gmail", {
    returnUrl: "https://app.example.com/integrations",
  });

  assert.ok(request instanceof ConnectionRequest);
  assert.equal(request.status, "pending");
  assert.equal(request.redirectUrl, "https://accounts.example.com/oauth");
  assert.equal(
    captured.input,
    "https://toolkit.notelab.io/api/toolkit/v1/connected-accounts/authorize",
  );
  assert.equal(captured.init.method, "POST");
  assert.deepEqual(JSON.parse(captured.init.body), {
    userId: "user_1",
    connectorId: "gmail",
    redirectUrl: "https://app.example.com/integrations",
    read: "all",
    write: [],
  });
});

test("accepts redirectUrl as a compatibility alias for returnUrl", async () => {
  let capturedBody;
  const toolkit = new Toolkit({
    apiKey: "project_key",
    fetch: async (_input, init) => {
      capturedBody = JSON.parse(init.body);
      return json(pendingRequest(), { status: 201 });
    },
  });

  await toolkit.connectors.authorize("user_1", "gmail", {
    redirectUrl: "https://app.example.com/legacy-return",
  });

  assert.equal(
    capturedBody.redirectUrl,
    "https://app.example.com/legacy-return",
  );
});

test("manages user-scoped connected accounts", async () => {
  const requests = [];
  const toolkit = new Toolkit({
    apiKey: "project_key",
    fetch: async (input, init) => {
      const request = {
        url: String(input),
        method: init.method,
        body: init.body,
      };
      requests.push(request);

      if (request.method === "DELETE") return new Response(null, { status: 204 });
      if (request.url.includes("/default")) return json(account);
      if (request.url.includes(account.id)) return json(account);
      return json({ items: [account], nextCursor: "cursor_2" });
    },
  });

  const listed = await toolkit.connectedAccounts.list("user_1", {
    connectorId: "gmail",
    cursor: "cursor_1",
    limit: 10,
  });
  const fetched = await toolkit.connectedAccounts.get(account.id, { userId: "user_1" });
  const selected = await toolkit.connectedAccounts.setDefault(account.id, "user_1");
  await toolkit.connectedAccounts.delete(account.id, "user_1");

  assert.deepEqual(listed, { items: [account], nextCursor: "cursor_2" });
  assert.deepEqual(fetched, account);
  assert.deepEqual(selected, account);
  assert.equal(
    requests[0].url,
    "https://toolkit.notelab.io/api/toolkit/v1/connected-accounts?userId=user_1&connectorId=gmail&cursor=cursor_1&limit=10",
  );
  assert.equal(requests[1].url.endsWith(`${account.id}?userId=user_1`), true);
  assert.equal(requests[2].method, "PATCH");
  assert.deepEqual(JSON.parse(requests[2].body), { userId: "user_1" });
  assert.equal(requests[3].method, "DELETE");
  assert.equal(requests[3].url.endsWith(`${account.id}?userId=user_1`), true);
});

test("polls an authorization request until an account becomes active", async () => {
  let polls = 0;
  const toolkit = new Toolkit({
    apiKey: "project_key",
    fetch: async (input) => {
      if (String(input).endsWith("/v1/connected-accounts/authorize")) {
        return json(pendingRequest(), { status: 201 });
      }

      polls += 1;
      return json(
        pendingRequest({
          status: polls > 1 ? "active" : "pending",
          connectedAccount: polls > 1 ? account : undefined,
        }),
      );
    },
  });

  const request = await toolkit.connectedAccounts.authorize("user_1", "gmail", {
    returnUrl: "https://app.example.com/integrations",
  });
  const connected = await request.waitForConnection({ pollIntervalMs: 1 });

  assert.equal(polls, 2);
  assert.deepEqual(connected, account);
  assert.equal(request.status, "active");
});

test("maps terminal connection states to structured errors", async (t) => {
  async function requestWithSnapshot(snapshot) {
    const toolkit = new Toolkit({
      apiKey: "project_key",
      fetch: async (input) =>
        String(input).endsWith("/authorize")
          ? json(pendingRequest(), { status: 201 })
          : json(pendingRequest(snapshot)),
    });
    return toolkit.connectedAccounts.authorize("user_1", "gmail", {
      returnUrl: "https://app.example.com/integrations",
    });
  }

  await t.test("failed", async () => {
    const request = await requestWithSnapshot({
      status: "failed",
      failure: { code: "OAUTH_DENIED", message: "Authorization was denied" },
    });

    await assert.rejects(request.waitForConnection(), (error) => {
      assert.ok(error instanceof ToolkitError);
      assert.equal(error.code, "OAUTH_DENIED");
      assert.deepEqual(error.details, {
        code: "OAUTH_DENIED",
        message: "Authorization was denied",
      });
      return true;
    });
  });

  await t.test("expired", async () => {
    const request = await requestWithSnapshot({ status: "expired" });

    await assert.rejects(request.waitForConnection(), (error) => {
      assert.ok(error instanceof ToolkitError);
      assert.equal(error.code, "CONNECTION_EXPIRED");
      return true;
    });
  });
});

test("distinguishes polling timeout from caller cancellation", async (t) => {
  function pendingToolkit() {
    return new Toolkit({
      apiKey: "project_key",
      fetch: async () => json(pendingRequest()),
    });
  }

  await t.test("timeout", async () => {
    const request = await pendingToolkit().connectedAccounts.authorize(
      "user_1",
      "gmail",
      { returnUrl: "https://app.example.com/integrations" },
    );

    await assert.rejects(
      request.waitForConnection({ timeoutMs: 5 }),
      (error) => error instanceof ToolkitError && error.code === "CONNECTION_TIMEOUT",
    );
  });

  await t.test("caller cancellation", async () => {
    const request = await pendingToolkit().connectedAccounts.authorize(
      "user_1",
      "gmail",
      { returnUrl: "https://app.example.com/integrations" },
    );
    const controller = new AbortController();
    controller.abort(new Error("cancelled by user"));

    await assert.rejects(
      request.waitForConnection({ signal: controller.signal }),
      (error) => error instanceof ToolkitError && error.code === "REQUEST_ABORTED",
    );
  });
});
